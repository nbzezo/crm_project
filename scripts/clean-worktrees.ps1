<#
  Dọn worktree an toàn trên Windows: tháo junction trước, xác nhận còn 0, rồi mới xóa.
  Xem scripts/worktree-junctions.ps1 để biết vì sao bắt buộc phải làm theo thứ tự đó.

  pwsh scripts/clean-worktrees.ps1                   # chỉ liệt kê, KHÔNG xóa gì
  pwsh scripts/clean-worktrees.ps1 -Apply            # tháo junction rồi xóa thật
  pwsh scripts/clean-worktrees.ps1 -Apply -Force     # xóa cả worktree còn thay đổi chưa commit
  pwsh scripts/clean-worktrees.ps1 -Path <thu-muc> -Apply

  Mặc định dọn worktree của Claude Code trong <repo>/.claude/worktrees.
  Worktree của Codex dùng lệnh riêng: pwsh scripts/codex.ps1 clean
#>
param(
  [string]$Path,
  [switch]$Apply,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/worktree-junctions.ps1"

$root = Split-Path (git rev-parse --path-format=absolute --git-common-dir).Trim() -Parent
$base = if ($Path) { (Resolve-Path -LiteralPath $Path).Path } else { Join-Path $root '.claude/worktrees' }

if (-not (Test-Path -LiteralPath $base)) { "Không có '$base', không phải dọn gì."; return }

$dirs = @(Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue)
if (-not $dirs) { "'$base' đã sạch."; return }

# Nhánh nào đang được worktree giữ thì git mới dọn được bằng `git worktree remove`.
$registered = @{}
foreach ($line in (git worktree list --porcelain)) {
  if ($line -like 'worktree *') { $registered[$line.Substring(9)] = $true }
}

"$($dirs.Count) thư mục trong '$base'" + $(if ($Apply) { ':' } else { " (chạy thử, thêm -Apply để xóa thật):" })
$skipped = 0

foreach ($d in $dirs) {
  $junctions = Get-WorktreeJunctions $d.FullName
  # Junction trỏ ra ngoài $base mới là cái phá repo chính; cái trỏ nội bộ thì vô hại.
  $outside = @($junctions | Where-Object { -not $_.Target.StartsWith($base, 'OrdinalIgnoreCase') })
  $isWt = $registered.ContainsKey($d.FullName.Replace('\', '/'))
  $dirty = $isWt -and @(git -C $d.FullName status --porcelain 2>$null).Count -gt 0

  $note = "$($junctions.Count) junction"
  if ($outside.Count -gt 0) { $note += ", $($outside.Count) TRỎ RA NGOÀI" }
  if ($dirty) { $note += ', còn thay đổi chưa commit' }

  if (-not $Apply) {
    "  $($d.Name)  [$note]"
    foreach ($o in $outside) { "      ra ngoài: $($o.FullName.Substring($base.Length + 1)) -> $($o.Target)" }
    continue
  }

  if ($dirty -and -not $Force) {
    Write-Warning "Bỏ qua $($d.Name): còn thay đổi chưa commit. Thêm -Force để bỏ."
    $skipped++
    continue
  }

  # Tháo junction TRƯỚC, kể cả khi để git xóa, vì `git worktree remove` cũng xóa đệ quy.
  $n = Remove-WorktreeJunctions $d.FullName
  $left = Get-WorktreeJunctions $d.FullName
  if ($left.Count -gt 0) {
    Write-Warning "Bỏ qua $($d.Name): còn $($left.Count) junction chưa tháo được."
    $skipped++
    continue
  }

  if ($isWt) { git worktree remove --force $d.FullName | Out-Null }
  if (Test-Path -LiteralPath $d.FullName) { [IO.Directory]::Delete($d.FullName, $true) }
  "  đã xóa $($d.Name) (tháo $n junction)"
}

if ($Apply) {
  git worktree prune
  "Xong. Bỏ qua: $skipped."
}

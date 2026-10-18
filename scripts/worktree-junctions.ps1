<#
  Hàm dùng chung để xóa worktree an toàn trên Windows. Chỉ khai báo hàm, không tự chạy gì,
  nên dot-source được: . "$PSScriptRoot/worktree-junctions.ps1"

  VÌ SAO CẦN: repo dùng npm workspaces, nên node_modules của repo chính chứa symlink trỏ
  NGƯỢC về mã nguồn (node_modules/client -> client/, node_modules/server -> server/,
  node_modules/@workflow/contracts -> packages/contracts/). Worktree lại mượn node_modules
  của repo chính qua junction. Vì vậy một lệnh xóa đệ quy trong worktree sẽ đi xuyên
  junction, rồi đi tiếp qua các symlink workspace, và xóa MÃ NGUỒN THẬT của repo chính:

      <worktree>/node_modules --junction--> <repo>/node_modules
                                              |-- client              --symlink--> <repo>/client
                                              |-- server              --symlink--> <repo>/server
                                              `-- @workflow/contracts --symlink--> <repo>/packages/contracts

  Ngày 2026-10-18 chuỗi này đã xóa 713 file đã track trong client/, server/, packages/.
  Khôi phục được bằng `git restore` vì index còn nguyên, nhưng phải npm ci lại.

  Nguyên tắc: luôn THÁO HẾT junction trước, XÁC NHẬN còn 0, rồi mới xóa đệ quy.
#>

# Tìm mọi junction/symlink thư mục bên trong $dir. Get-ChildItem -Recurse của PowerShell 7
# KHÔNG đi xuyên reparse point (phải có -FollowSymlink mới đi), nên phép quét này an toàn.
function Get-WorktreeJunctions([string]$dir) {
  @(Get-ChildItem -LiteralPath $dir -Recurse -Force -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
}

# Tháo mọi junction bên trong $dir: xóa bản thân cái link, KHÔNG xóa thư mục đích.
# Quét đệ quy toàn bộ độ sâu, không dựa vào danh sách đường dẫn biết trước, vì junction
# có thể nằm sâu bất kỳ đâu (ví dụ server/node_modules/typescript).
function Remove-WorktreeJunctions([string]$dir) {
  $n = 0
  foreach ($j in (Get-WorktreeJunctions $dir)) {
    [IO.Directory]::Delete($j.FullName, $false)   # $false = chỉ xóa link
    $n++
  }
  $n
}

# Xóa worktree an toàn: tháo junction, xác nhận còn 0, rồi mới xóa đệ quy.
# Từ chối xóa nếu còn junction, thà để lại rác hơn là phá repo chính.
function Remove-WorktreeSafely([string]$dir) {
  if (-not (Test-Path -LiteralPath $dir)) { return 0 }
  $n = Remove-WorktreeJunctions $dir
  $left = Get-WorktreeJunctions $dir
  if ($left.Count -gt 0) {
    throw "Còn $($left.Count) junction trong '$dir' chưa tháo được; KHÔNG xóa để tránh phá repo chính."
  }
  [IO.Directory]::Delete($dir, $true)
  $n
}

<#
  Giao việc cho Codex CLI trong worktree riêng, rồi Claude duyệt và đưa kết quả về.
  Xem mục "Giao việc cho Codex" trong CLAUDE.md và AGENTS.md.

  pwsh scripts/codex.ps1 run    -Slug <ten> -Spec <file.md> [-Model <m>] [-TimeoutMin 30]
  pwsh scripts/codex.ps1 status [-Slug <ten>]
  pwsh scripts/codex.ps1 apply  -Slug <ten> [-Allow 'client/src/lib/*.test.ts'] [-NoCheck]
        # chặn file cấm / ngoài phạm vi, chép vào worktree hiện tại (đã stage), rồi tự chạy kiểm tra
  pwsh scripts/codex.ps1 clean  [-Slug <ten>] [-AllSessions] [-Force]

  Worktree của Codex: <repo>/.codex-worktrees/<phiên>--<ten>, nhánh codex/<phiên>/<ten>.
  <phiên> là tên worktree đang chạy lệnh, nên "clean" chỉ dọn việc của phiên này.
#>
param(
  [Parameter(Position = 0, Mandatory)][ValidateSet('run', 'status', 'apply', 'clean')][string]$Command,
  [string]$Slug,
  [string]$Spec,
  [string]$Model,
  [int]$TimeoutMin = 30,
  [string[]]$Allow,
  [switch]$NoCheck,
  [switch]$AllSessions,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'

# File Codex không bao giờ được sửa (khớp AGENTS.md); apply từ chối nếu đụng vào.
$forbidden = @(
  'server/src/db/migrate*', 'server/src/db/rollback.ts', 'package.json', '*/package.json',
  'package-lock.json', 'client/src/lib/appRelease.ts', '.env*', '*/.env*', 'server/data/*',
  'AGENTS.md', 'CLAUDE.md', 'scripts/codex.ps1', '.github/*', '.gitignore'
)

$here = (git rev-parse --show-toplevel).Trim()
$root = Split-Path (git rev-parse --path-format=absolute --git-common-dir).Trim() -Parent
$session = Split-Path $here -Leaf
$base = Join-Path $root '.codex-worktrees'
$logs = Join-Path $base '_logs'
$modules = @('node_modules', 'client/node_modules', 'server/node_modules')

function Get-TaskDir([string]$s) { Join-Path $base "$session--$s" }
function Get-TaskBranch([string]$s) { "codex/$session/$s" }

function Get-CodexWorktrees {
  $list = @(); $cur = $null
  foreach ($line in (git worktree list --porcelain)) {
    if ($line -like 'worktree *') { $cur = @{ Path = $line.Substring(9) } }
    elseif ($line -like 'branch refs/heads/codex/*') {
      $cur.Branch = $line.Substring(18)
      $parts = $cur.Branch.Split('/')
      $cur.Session = $parts[1]; $cur.Slug = ($parts[2..($parts.Length - 1)] -join '/')
      $list += [pscustomobject]$cur
    }
  }
  $list
}

# node_modules mượn từ repo chính qua junction để Codex chạy được test mà không cần npm install.
function Add-ModuleLinks([string]$dir) {
  foreach ($m in $modules) {
    $src = Join-Path $root $m; $dst = Join-Path $dir $m
    if ((Test-Path $src) -and -not (Test-Path $dst)) {
      New-Item -ItemType Junction -Path $dst -Target $src | Out-Null
    }
  }
}

# Gỡ junction TRƯỚC khi xóa worktree, để không xóa lan sang node_modules của repo chính.
function Remove-ModuleLinks([string]$dir) {
  foreach ($m in $modules) {
    $dst = Join-Path $dir $m
    $item = Get-Item $dst -Force -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -eq 'Junction') { cmd /c rmdir "$dst" | Out-Null }
  }
}

function Assert-Slug { if (-not $Slug -or $Slug -notmatch '^[a-z0-9][a-z0-9-]*$') { throw 'Cần -Slug dạng chữ thường, số, gạch ngang.' } }

switch ($Command) {
  'run' {
    Assert-Slug
    if (-not $Spec -or -not (Test-Path $Spec)) { throw 'Cần -Spec trỏ tới file đặc tả.' }
    if (git -C $here status --porcelain) { Write-Warning 'Worktree hiện tại có thay đổi chưa commit; Codex chỉ thấy HEAD.' }
    $dir = Get-TaskDir $Slug; $branch = Get-TaskBranch $Slug
    if (Test-Path $dir) { throw "Đã có $dir. Dùng tên khác hoặc chạy clean -Slug $Slug." }
    New-Item -ItemType Directory -Force -Path $logs | Out-Null
    git -C $here worktree add -q -b $branch $dir HEAD
    Add-ModuleLinks $dir

    $log = Join-Path $logs "$session--$Slug.log"
    $result = Join-Path $logs "$session--$Slug.result.md"
    $codexArgs = @('exec', '-C', $dir, '-s', 'workspace-write', '--ephemeral', '--color', 'never', '-o', $result)
    # Vite/Vitest ghi cache vào node_modules/.vite*, mà node_modules là junction ra ngoài sandbox.
    foreach ($m in $modules) {
      foreach ($c in '.vite', '.vite-temp') {
        $cache = Join-Path (Join-Path $root $m) $c
        if (Test-Path (Join-Path $root $m)) {
          New-Item -ItemType Directory -Force -Path $cache | Out-Null
          $codexArgs += @('--add-dir', $cache)
        }
      }
    }
    if ($Model) { $codexArgs += @('-m', $Model) }
    $prompt = (Get-Content $Spec -Raw) + "`n`nĐọc AGENTS.md ở gốc repo trước khi làm. Không commit, không push."

    $job = Start-Job -ScriptBlock { param($a, $p, $l) $p | codex @a *> $l; $LASTEXITCODE } -ArgumentList (, $codexArgs), $prompt, $log
    if (-not (Wait-Job $job -Timeout ($TimeoutMin * 60))) {
      Stop-Job $job; Write-Warning "Codex quá $TimeoutMin phút, đã dừng. Log: $log"
    }
    $exit = Receive-Job $job -ErrorAction SilentlyContinue | Select-Object -Last 1
    Remove-Job $job -Force
    "== Codex xong (exit $exit) =="
    "Log: $log"; "Kết quả: $result"
    if (Test-Path $result) { Get-Content $result }
    "== Thay đổi =="
    git -C $dir add -A
    git -C $dir diff --cached --stat
  }

  'status' {
    $items = Get-CodexWorktrees | Where-Object { $AllSessions -or $_.Session -eq $session }
    if ($Slug) { $items = $items | Where-Object Slug -eq $Slug }
    foreach ($w in $items) {
      $n = @(git -C $w.Path status --porcelain).Count
      "{0}  [{1}]  {2} file thay đổi" -f $w.Branch, $w.Path, $n
    }
    if (-not $items) { 'Không có worktree Codex nào.' }
  }

  'apply' {
    Assert-Slug
    $dir = Get-TaskDir $Slug
    if (-not (Test-Path $dir)) { throw "Không thấy $dir." }
    git -C $dir add -A
    $files = @(git -C $dir diff --cached --name-only)
    if (-not $files) { 'Codex không thay đổi gì.'; break }

    # Chốt 1: file cấm (xem AGENTS.md) — đụng vào là từ chối, không cần đọc diff.
    $bad = $files | Where-Object { $f = $_; $forbidden | Where-Object { $f -like $_ } }
    if ($bad) { throw "Codex sửa file cấm, không apply: $($bad -join ', ')" }
    # Chốt 2: phạm vi được giao (-Allow), nếu có. Gọi qua `pwsh -File` thì mảng đến dưới dạng
    # một chuỗi "a,b,c", nên tách lại theo dấu phẩy.
    $Allow = @($Allow | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim(" '`"") } | Where-Object { $_ })
    if ($Allow) {
      $out = $files | Where-Object { $f = $_; -not ($Allow | Where-Object { $f -like $_ }) }
      if ($out) { throw "Codex sửa ngoài phạm vi -Allow, không apply: $($out -join ', ')" }
    }

    $patch = Join-Path $logs "$session--$Slug.patch"
    # Để git tự ghi file: đi qua pipe của PowerShell sẽ làm hỏng xuống dòng và dữ liệu nhị phân.
    git -C $dir diff --cached --binary --output="$patch"
    git -C $here apply --3way --index $patch
    if ($LASTEXITCODE -ne 0) { throw "git apply lỗi; worktree Codex vẫn giữ nguyên. Patch: $patch" }
    "Đã đưa $($files.Count) file vào $here (đã stage, chưa commit). Patch: $patch"
    if ($NoCheck) { break }

    # Chốt 3: kiểm tra tự động ở worktree hiện tại. Đạt thì không cần đọc diff.
    $failed = @()
    $code = @($files | Where-Object { $_ -match '\.(ts|tsx|js|mjs)$' })
    Push-Location $here
    try {
      if ($files -match '^(client|packages)/') {
        Push-Location client
        npx tsc --noEmit -p tsconfig.json; if ($LASTEXITCODE) { $failed += 'client tsc' }
        npx vitest run; if ($LASTEXITCODE) { $failed += 'client vitest' }
        Pop-Location
      }
      if ($files -match '^(server|packages)/') {
        Push-Location server
        node scripts/run-tests.mjs; if ($LASTEXITCODE) { $failed += 'server tests' }
        Pop-Location
      }
      $lint = @($code | Where-Object { $_ -match '^(client|server)/src/' })
      if ($lint) { npx eslint @lint; if ($LASTEXITCODE) { $failed += 'eslint' } }
      $fmt = @($files | Where-Object { $_ -match '\.(ts|tsx|js|mjs|json|md|css)$' })
      if ($fmt) { npx prettier --check @fmt; if ($LASTEXITCODE) { $failed += 'prettier' } }
    }
    finally { Pop-Location }
    if ($failed) { Write-Error "KIỂM TRA TRƯỢT: $($failed -join ', '). Cần đọc diff và sửa."; exit 1 }
    'KIỂM TRA ĐẠT: có thể commit, không cần đọc diff.'
  }

  'clean' {
    $items = Get-CodexWorktrees | Where-Object { $AllSessions -or $_.Session -eq $session }
    if ($Slug) { $items = $items | Where-Object Slug -eq $Slug }
    foreach ($w in $items) {
      $dirty = @(git -C $w.Path status --porcelain).Count -gt 0
      $patch = Join-Path $logs "$($w.Session)--$($w.Slug).patch"
      if ($dirty -and -not (Test-Path $patch) -and -not $Force) {
        Write-Warning "Bỏ qua $($w.Branch): còn thay đổi chưa apply. Thêm -Force để bỏ."
        continue
      }
      Remove-ModuleLinks $w.Path
      git worktree remove --force $w.Path
      git branch -D $w.Branch | Out-Null
      Get-ChildItem $logs -Filter "$($w.Session)--$($w.Slug).*" -ErrorAction SilentlyContinue | Remove-Item -Force
      "Đã dọn $($w.Branch)"
    }
    git worktree prune
    if (-not $items) { 'Không có worktree Codex nào để dọn.' }
  }
}

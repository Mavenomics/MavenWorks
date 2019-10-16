$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkgDir = Join-Path -Path $scriptDir -ChildPath ..\packages\

$files = Get-ChildItem $pkgDir

$registry = "http://localhost:4873/"

# ps1 doesn't support for..in
$files | ForEach-Object {
    $path = Join-Path -Path $_.FullName -ChildPath package.json
    $pkgData = Get-Content $path | Out-String
    $pkgData -match '"name":\s*"([a-zA-Z\/\@]+)"'
    $pkgName = $Matches[1]

    npm unpublish $pkgName --registry=$registry --force
    npm publish $_.FullName --registry=$registry --force
}
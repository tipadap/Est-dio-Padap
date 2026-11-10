# Passo 1 de 2: extrai os modelos do PPTX (fundo de cada slide, imagens de cada forma e textos com
# formatação) usando o PowerPoint instalado no Windows. Passo 2: scripts/modelos-pptx/converter.js.
#
#   powershell -ExecutionPolicy Bypass -File scripts\modelos-pptx\extrair.ps1 -Pptx "C:\caminho\Modelos_Slides_PADAP.pptx"
#
# Saída: pasta .cache-modelos (fora do git) com slides.json + PNGs. O PPTX original não é alterado
# (é aberto somente leitura e fechado sem salvar).
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
# raiz do projeto = três níveis acima de scripts\modelos-pptx\extrair.ps1
if (-not $Out) { $Out = Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))) '.cache-modelos' }
$Pptx = (Resolve-Path $Pptx).Path
$out = $Out
Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $out | Out-Null
$K = 2.0  # pt -> px (slide 960pt -> 1920px)

function Rgb($v) { return '#{0:X2}{1:X2}{2:X2}' -f ($v -band 255), (($v -shr 8) -band 255), (($v -shr 16) -band 255) }

function ExportBig($sh, $path) {
  # Exporta em 2 px/pt: amplia 1,5x só na memória (o arquivo não é salvo) e usa o tamanho padrão (1,333 px/pt).
  $w = $sh.Width; $h = $sh.Height
  try {
    try { $sh.LockAspectRatio = [int]0 } catch {}
    $sh.Width = [single]($w * 1.5); $sh.Height = [single]($h * 1.5)
    $sh.Export($path, 2)
    $sh.Width = [single]$w; $sh.Height = [single]$h
  } catch {
    Write-Host "  (tamanho padrão) $($sh.Name): $($_.Exception.Message)"
    try { $sh.Width = [single]$w; $sh.Height = [single]$h } catch {}
    $sh.Export($path, 2)
  }
}

function ReadText($sh) {
  $tf = $sh.TextFrame
  $paras = @()
  $n = $tf.TextRange.Paragraphs().Count
  for ($pi = 1; $pi -le $n; $pi++) {
    $para = $tf.TextRange.Paragraphs($pi)
    $runs = @()
    $rc = $para.Runs().Count
    for ($ri = 1; $ri -le $rc; $ri++) {
      $r = $para.Runs($ri)
      $t = $r.Text -replace "[`r`n`v]", ''
      if ($t.Length -eq 0) { continue }
      $runs += [ordered]@{ text = $t; font = $r.Font.Name; size = $r.Font.Size; bold = [bool]$r.Font.Bold; italic = [bool]$r.Font.Italic; color = (Rgb $r.Font.Color.RGB) }
    }
    $pf = $para.ParagraphFormat
    $paras += [ordered]@{
      align = $pf.Alignment; bullet = [bool]($pf.Bullet.Visible -and $pf.Bullet.Type -ne 0); bulletType = $pf.Bullet.Type
      spaceWithin = $pf.SpaceWithin; lineRule = [bool]$pf.LineRuleWithin; runs = $runs
      size = $para.Font.Size; font = $para.Font.Name; bold = [bool]$para.Font.Bold; color = (Rgb $para.Font.Color.RGB)
    }
  }
  return [ordered]@{
    paras = $paras; anchor = $tf.VerticalAnchor
    ml = $tf.MarginLeft * $K; mr = $tf.MarginRight * $K; mt = $tf.MarginTop * $K; mb = $tf.MarginBottom * $K
    wrap = [bool]$tf.WordWrap
  }
}

$app = New-Object -ComObject PowerPoint.Application
$slides = @()
try {
  # ReadOnly=1, Untitled=0, WithWindow=0
  $p = $app.Presentations.Open($Pptx, 1, 0, 0)
  foreach ($s in $p.Slides) {
    $si = $s.SlideIndex
    $items = @()
    $idx = 0
    foreach ($sh in @($s.Shapes)) {
      $idx++
      $box = [ordered]@{ x = [math]::Round($sh.Left * $K); y = [math]::Round($sh.Top * $K); w = [math]::Round($sh.Width * $K); h = [math]::Round($sh.Height * $K); rot = $sh.Rotation }
      $type = $sh.Type
      $isPic = $type -eq 13
      if ($type -eq 14) { try { if ($sh.PlaceholderFormat.ContainedType -eq 13) { $isPic = $true } } catch {} }
      $hasText = $false
      if ($sh.HasTextFrame) { if ($sh.TextFrame.HasText) { $hasText = $true } }
      $item = [ordered]@{ i = $idx; name = $sh.Name; type = $type; box = $box }

      if ($isPic) {
        $f = "s$si-$idx-pic.png"
        ExportBig $sh "$out\$f"
        $item.kind = 'pic'; $item.file = $f
        try { $item.ast = $sh.AutoShapeType } catch {}
      }
      elseif ($type -eq 19) {
        # Tabela: células com preenchimento e texto
        $tb = $sh.Table
        $cells = @()
        $yy = $sh.Top
        for ($r = 1; $r -le $tb.Rows.Count; $r++) {
          $xx = $sh.Left
          $rh = $tb.Rows.Item($r).Height
          for ($c = 1; $c -le $tb.Columns.Count; $c++) {
            $cw = $tb.Columns.Item($c).Width
            $cs = $tb.Cell($r, $c).Shape
            $fill = $null
            if ($cs.Fill.Visible -and $cs.Fill.Transparency -lt 1) { $fill = Rgb $cs.Fill.ForeColor.RGB }
            $t = $null
            if ($cs.TextFrame.HasText) { $t = ReadText $cs }
            $cells += [ordered]@{ x = [math]::Round($xx * $K); y = [math]::Round($yy * $K); w = [math]::Round($cw * $K); h = [math]::Round($rh * $K); fill = $fill; text = $t }
            $xx += $cw
          }
          $yy += $rh
        }
        $item.kind = 'table'; $item.cells = $cells
      }
      else {
        # Formas e textos
        $simple = $false
        if ($type -eq 1) {
          $ast = $sh.AutoShapeType
          $solid = ($sh.Fill.Visible -eq 0) -or ($sh.Fill.Type -eq 1)
          if (($ast -eq 1 -or $ast -eq 5 -or $ast -eq 9) -and $solid -and $sh.Rotation -eq 0) {
            $simple = $true
            $item.kind = 'shape'; $item.ast = $ast
            $item.fill = $(if ($sh.Fill.Visible) { Rgb $sh.Fill.ForeColor.RGB } else { 'none' })
            $item.fillTransp = $sh.Fill.Transparency
            $item.line = $(if ($sh.Line.Visible) { Rgb $sh.Line.ForeColor.RGB } else { 'none' })
            $item.lineW = $(if ($sh.Line.Visible) { $sh.Line.Weight * $K } else { 0 })
            try { $item.adj = $sh.Adjustments.Item(1) } catch {}
          }
        }
        $hasVisual = $false
        try { if ($sh.Fill.Visible -or $sh.Line.Visible) { $hasVisual = $true } } catch {}
        if ($type -eq 3 -or $type -eq 9 -or $type -eq 5) { $hasVisual = $true }
        if ($type -eq 17 -or $type -eq 14) { try { if (-not $sh.Fill.Visible -and -not $sh.Line.Visible) { $hasVisual = $false } } catch {} }
        if ($hasText) { $item.text = ReadText $sh }
        if (-not $simple -and $hasVisual) {
          # parte visual vira imagem (sem o texto, que fica editável por cima)
          if ($hasText) { $sh.TextFrame.TextRange.Text = '' }
          $f = "s$si-$idx-vis.png"
          ExportBig $sh "$out\$f"
          $item.kind = $(if ($type -eq 3) { 'chart' } else { 'visual' }); $item.file = $f
        }
        elseif (-not $simple) { $item.kind = 'text' }
      }
      $items += $item
    }
    # fundo: sem numeração de página e com todas as formas escondidas
    try { $s.HeadersFooters.SlideNumber.Visible = 0 } catch {}
    foreach ($sh in @($s.Shapes)) { $sh.Visible = 0 }
    $bg = "s$si-bg.png"
    $s.Export("$out\$bg", 'PNG', 1920, 1080)
    $slides += [ordered]@{ index = $si; bg = $bg; items = $items }
    Write-Host "slide $si : $($items.Count) itens"
  }
  $p.Saved = -1  # descarta as alterações feitas na memória (formas escondidas/ampliadas)
  $p.Close()
} finally { $app.Quit() }
$slides | ConvertTo-Json -Depth 12 | Out-File "$out\slides.json" -Encoding utf8
"ok"

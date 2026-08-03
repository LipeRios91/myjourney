# Mic Recorder (Windows)

App de gravação de microfone para Windows, feito em C# / WPF (.NET 8), usando
[NAudio](https://github.com/naudio/NAudio) para captura de áudio via WASAPI.

Grava continuamente enquanto estiver ativo, mas divide o áudio automaticamente
em arquivos separados por sessão de fala: quando detecta um silêncio mais
longo que o configurado, fecha o arquivo atual; quando a fala volta, abre um
novo arquivo (com um pequeno "pré-roll" pra não cortar a primeira sílaba).
Isso é útil pra depois transcrever cada sessão individualmente, sem precisar
lidar com um único arquivo gigante de horas de silêncio.

## Requisitos

- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download) (ou Visual Studio 2022
  com a carga de trabalho ".NET desktop development")

## Rodar

```powershell
cd MicRecorder
dotnet restore
dotnet run
```

Ou abra `MicRecorder.sln` no Visual Studio e pressione F5.

## Gerar um .exe standalone

```powershell
cd MicRecorder
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

O executável fica em `MicRecorder/bin/Release/net8.0-windows/win-x64/publish/`.

## Como funciona

- **Seleção de microfone**: lista os dispositivos de captura ativos do
  Windows (via `MMDeviceEnumerator`/WASAPI) num dropdown.
- **Sensibilidade de silêncio**: threshold de RMS (0 a 1) acima do qual o
  áudio é considerado "fala". Ajustável na UI.
- **Pausa para dividir arquivo**: quantos segundos de silêncio contínuo são
  necessários para fechar a sessão atual e aguardar uma nova fala. Pausas
  mais curtas que isso (respirar, pontuação) não quebram o arquivo.
- **Arquivos gerados**: `Documentos\MicRecorder\Gravacoes\gravacao_AAAA-MM-DD_HH-mm-ss.wav`.
- Todo o processamento é local — nenhum áudio sai da máquina do usuário.

## Estrutura

```
MicRecorder/
  Audio/
    MicDevice.cs           # enumeração dos microfones disponíveis
    SegmentingRecorder.cs  # captura contínua + detecção de silêncio + segmentação
  MainWindow.xaml(.cs)      # UI: seleção de dispositivo, nível de áudio, controles
  App.xaml(.cs)
```

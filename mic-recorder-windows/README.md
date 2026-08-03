# Mic Recorder (Windows)

App de gravação para Windows, feito em C# / WPF (.NET 8), usando
[NAudio](https://github.com/naudio/NAudio) para captura de áudio via WASAPI.

A ideia: ligar o app e, no fim do dia, ter tudo gravado — tanto o que você
**falou** (microfone) quanto o que você **ouviu** (áudio do sistema: reuniões,
vídeos, músicas, etc.), pronto para transcrever depois com outra ferramenta.

## Como funciona

- **Captura dupla e simultânea**: microfone (o que você fala) e a saída de
  áudio do sistema via WASAPI loopback (o que você ouve), sincronizados num
  único arquivo `.wav` estéreo — canal esquerdo = sua voz, canal direito = o
  que o sistema está tocando.
- **Segmentação por silêncio**: enquanto qualquer uma das duas fontes está
  ativa (falando ou tocando algo), grava no mesmo arquivo. Quando as duas
  ficam em silêncio por tempo suficiente (configurável), fecha a sessão atual;
  ao voltar a atividade, abre um novo arquivo — com um pequeno "pré-roll" pra
  não cortar o início.
- **Bandeja do sistema**: o app roda minimizado na bandeja (não abre uma
  janela toda vez). Clique com o botão direito no ícone pra "Iniciar/Parar
  gravação", abrir "Configurações", ligar "Iniciar com o Windows" ou "Sair".
  Clique simples no ícone abre a janela de configurações.
- **Confirmação por voz**: quando a gravação está desligada, o app escuta o
  microfone só para detectar volume (nunca grava nada nesse modo) — se
  perceber que você começou a falar, mostra um aviso no canto da tela
  perguntando se quer ligar a gravação agora. Ignorar ou recusar soneca o
  aviso por 5 minutos.
- **100% local**: nenhum áudio sai da sua máquina. Este app não faz
  transcrição — só grava e organiza os arquivos; a conversão pra texto fica
  para uma ferramenta separada, por decisão explícita (ver histórico do
  projeto).

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

Na primeira execução, a janela de configurações abre automaticamente para
você escolher o microfone e a saída de som. Nas próximas vezes, o app abre
direto na bandeja — clique no ícone pra reabrir as configurações.

## Gerar um .exe standalone

```powershell
cd MicRecorder
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

O executável fica em `MicRecorder/bin/Release/net8.0-windows/win-x64/publish/`.

## Onde ficam as gravações

`Documentos\MicRecorder\Gravacoes\sessao_AAAA-MM-DD_HH-mm-ss.wav`

## Estrutura

```
MicRecorder/
  Audio/
    AudioDeviceInfo.cs         # lista microfones e saídas de som disponíveis
    AudioLevel.cs               # cálculo de RMS (nível de volume)
    MonoMixSampleProvider.cs    # reduz qualquer fonte multicanal pra mono
    VoiceActivityMonitor.cs     # escuta o mic só pra detectar "começou a falar" (não grava)
    DualSourceRecorder.cs       # captura mic + sistema, mixa em estéreo, segmenta por silêncio
  Settings/
    AppSettings.cs              # persistência em %AppData%\MicRecorder\settings.json
    StartupRegistration.cs      # liga/desliga "iniciar com o Windows"
  Tray/
    TrayIconManager.cs          # ícone e menu da bandeja do sistema
  VoiceDetectedWindow.xaml(.cs) # popup "detectei que você começou a falar"
  MainWindow.xaml(.cs)          # janela de configurações/status
  App.xaml(.cs)                 # orquestra bandeja + janela + ciclo de vida
```

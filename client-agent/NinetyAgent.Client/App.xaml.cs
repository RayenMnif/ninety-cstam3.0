using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Lockdown;
using NinetyAgent.Client.Networking;
using NinetyAgent.Client.UI;

namespace NinetyAgent.Client;

public partial class App : Application
{
    private static ILogSink? _log;
    private static SystemLockdownManager? _lockdown;
    private static KioskOverlayWindow? _overlayWindow;
    private static WebSocketAgentClient? _client;
    private static decimal? _currentBalance;

    protected override void OnStartup(StartupEventArgs e)
    {
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
        base.OnStartup(e);

        try
        {
            WriteDebugLog("[App.OnStartup] Démarrage de l'application...");

            // 1. Initialiser le système de logs
            _log = new FileLogSink("Agent", echoToConsole: true);

            // 2. Initialiser le lockdown SANS l'engager
            _lockdown = new SystemLockdownManager(_log);
            _lockdown.Initialize();

            // 3. Démarrer le client réseau WebSocket en arrière-plan
            _client = new WebSocketAgentClient(_log!, () => new ClientHeartbeatPayload());
            _ = BootstrapNetworkAsync();

            // 4. AFFICHER UNIQUEMENT LA FENÊTRE DE LOGIN SUR LE BUREAU NORMAL
            WriteDebugLog("[App.OnStartup] Ouverture du LoginWindow...");
            var loginWindow = new LoginWindow(_client)
            {
                WindowStartupLocation = WindowStartupLocation.CenterScreen,
                Topmost = true
            };

            // Bloque ici jusqu'à la réussite de la connexion ou l'annulation
            bool? isSuccess = loginWindow.ShowDialog();

            // 5. ENGAGER LE LOCKDOWN ET L'OVERLAY UNIQUEMENT SI LOGIN RÉUSSI
            if (isSuccess == true)
            {
                _log?.Info("[Bootstrap] Connexion réussie ! Activation du verrouillage et du Kiosk...");

                // Activer le verrouillage système
                _lockdown.EngageLock();

                // Créer et afficher l'overlay Kiosk
                var bounds = new MonitorBounds(
                    0, 0,
                    (int)SystemParameters.PrimaryScreenWidth,
                    (int)SystemParameters.PrimaryScreenHeight,
                    true
                );

                _overlayWindow = new KioskOverlayWindow(bounds, showStatusPanel: true);
                _overlayWindow.Show();
                _overlayWindow.Topmost = true;
                _overlayWindow.Render(AgentState.LOCKED_IDLE, 0, _currentBalance, ConnectionState.Connected);
            }
            else
            {
                _log?.Info("[Bootstrap] Fermeture du login. Arrêt de l'application.");
                Shutdown();
            }
        }
        catch (Exception ex)
        {
            WriteDebugLog($"[App.OnStartup] Erreur critique: {ex}");
            Shutdown();
        }
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        if (_client != null)
        {
            await _client.DisposeAsync();
        }
        _lockdown?.Dispose();
        base.OnExit(e);
    }

    private async Task BootstrapNetworkAsync()
    {
        try
        {
            WriteDebugLog("[Bootstrap] Démarrage découverte UDP...");
            var discovery = new UdpDiscoveryClient();
            var serverIp = await discovery.DiscoverServerIpAsync().ConfigureAwait(true) ?? "127.0.0.1";

            _log?.Info($"[Bootstrap] Serveur détecté sur : {serverIp}");

            var server = new DiscoveredServer
            {
                Address = serverIp,
                WebSocketPort = 8080,
                IpAddress = serverIp,
                Port = 8080,
                ServerName = "LocalDebug"
            };

            if (_client != null)
            {
                _client.ConnectionStateChanged += state =>
                {
                    Dispatcher.Invoke(() =>
                    {
                        _overlayWindow?.Render(AgentState.LOCKED_IDLE, 0, _currentBalance, state);
                    });
                };

                _client.SessionCommandReceived += cmd =>
                {
                    if (cmd.WalletBalance.HasValue) _currentBalance = cmd.WalletBalance.Value;

                    switch (cmd.Action)
                    {
                        case "LOCK":
                            _lockdown?.EngageLock();
                            Dispatcher.Invoke(() => _overlayWindow?.Show());
                            break;
                        case "UNLOCK":
                        case "START":
                            _lockdown?.ReleaseLock();
                            Dispatcher.Invoke(() => _overlayWindow?.Hide());
                            break;
                    }
                };

                _client.Start(server, stationId: Guid.NewGuid().ToString(), agentVersion: "1.0.0", branchId: null);
            }
        }
        catch (Exception ex)
        {
            WriteDebugLog($"[Bootstrap] Erreur réseau: {ex.Message}");
        }
    }

    private static void WriteDebugLog(string message)
    {
        try
        {
            var logDir = @"C:\ProgramData\NinetyAgent\logs";
            Directory.CreateDirectory(logDir);
            var logFile = Path.Combine(logDir, "ui_debug.log");
            File.AppendAllText(logFile, $"{DateTime.Now:O} {message}{Environment.NewLine}");
        }
        catch { }
        Console.WriteLine(message);
    }
}
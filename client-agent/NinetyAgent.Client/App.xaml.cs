using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Lockdown;
using NinetyAgent.Client.Networking;

namespace NinetyAgent.Client;

public partial class App : Application
{
    private static ILogSink? _log;
    private static SystemLockdownManager? _lockdown;
    private static KioskOverlayWindow? _overlayWindow;
    private static decimal? _currentBalance;

    protected override void OnStartup(StartupEventArgs e)
    {
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
        base.OnStartup(e);

        try
        {
            WriteDebugLog("[App.OnStartup] Bootstrap starting on UI thread...");

            // 1. Initialize logging
            _log = new FileLogSink("Agent", echoToConsole: true);

            // 2. Instantiate and engage lockdown IMMEDIATELY on UI startup
            WriteDebugLog("[Bootstrap] Initializing SystemLockdownManager...");
            _lockdown = new SystemLockdownManager(_log);
            try
            {
                _lockdown.Initialize();
                _lockdown.EngageLock();
                _log.Info("[Bootstrap] Lockdown system initialized and engaged successfully.");

                // 3. EXPLICITLY CREATE AND DISPLAY THE KIOSK UI WINDOW
                WriteDebugLog("[Bootstrap] Instantiating KioskOverlayWindow...");
                var bounds = new MonitorBounds(
                    0,
                    0,
                    (int)SystemParameters.PrimaryScreenWidth,
                    (int)SystemParameters.PrimaryScreenHeight,
                    true
                );

                _overlayWindow = new KioskOverlayWindow(bounds, showStatusPanel: true);
                _overlayWindow.Show();
                _overlayWindow.Activate();
                WriteDebugLog("[Bootstrap] KioskOverlayWindow displayed successfully.");
            }
            catch (Exception ex)
            {
                _log.Error("[Bootstrap] Lockdown or UI initialization failed", ex);
                WriteDebugLog($"[Bootstrap] Lockdown/UI init error: {ex.Message}");
            }

            // 4. Run network discovery asynchronously without blocking UI overlay display
            _ = BootstrapNetworkAsync();
        }
        catch (Exception ex)
        {
            WriteDebugLog($"[App.OnStartup] Critical failure: {ex}");
        }
    }

    private async Task BootstrapNetworkAsync()
    {
        try
        {
            WriteDebugLog("[Bootstrap] Starting UDP discovery...");
            var discovery = new UdpDiscoveryClient();
            var serverIp = await discovery.DiscoverServerIpAsync().ConfigureAwait(true) ?? "127.0.0.1";

            _log?.Info($"[Bootstrap] Discovered server at {serverIp}");

            var server = new DiscoveredServer
            {
                Address = serverIp,
                WebSocketPort = 8080,
                IpAddress = serverIp,
                Port = 8080,
                ServerName = "LocalDebug"
            };

            WriteDebugLog("[Bootstrap] Creating WebSocketAgentClient...");
            var client = new WebSocketAgentClient(_log!, () => new ClientHeartbeatPayload());
            client.ConnectionStateChanged += state =>
            {
                _log?.Info($"[Bootstrap] ConnectionState changed to: {state}");
                WriteDebugLog($"[Bootstrap] WS State: {state}");
            };

            // Handle session commands from server
            client.SessionCommandReceived += cmd =>
            {
                _log?.Info($"[Bootstrap] SESSION_COMMAND received: Action={cmd.Action} SessionId={cmd.SessionId}");
                WriteDebugLog($"[Bootstrap] Handling SESSION_COMMAND: {cmd.Action}");

                // Update stored wallet balance if supplied in payload
                if (cmd.WalletBalance.HasValue)
                {
                    _currentBalance = cmd.WalletBalance.Value;
                }

                switch (cmd.Action)
                {
                    case "LOCK":
                        try
                        {
                            WriteDebugLog("[Bootstrap] EngageLock() called...");
                            _lockdown?.EngageLock();
                            Dispatcher.Invoke(() =>
                            {
                                if (_overlayWindow != null)
                                {
                                    _overlayWindow.Show();
                                    _overlayWindow.Activate();
                                    _overlayWindow.Topmost = true;
                                    _overlayWindow.Render(AgentState.LOCKED_IDLE, 0, _currentBalance, ConnectionState.Connected);
                                }
                            });
                            _log?.Info("[Bootstrap] Station locked successfully");
                        }
                        catch (Exception ex)
                        {
                            _log?.Error("[Bootstrap] EngageLock failed", ex);
                        }
                        break;

                    case "BALANCE_UPDATE":
                        Dispatcher.Invoke(() =>
                        {
                            _overlayWindow?.Render(AgentState.LOCKED_IDLE, 0, _currentBalance, ConnectionState.Connected);
                        });
                        _log?.Info($"[Bootstrap] Wallet balance updated to: {_currentBalance} TND");
                        break;

                    case "UNLOCK":
                    case "START":
                        try
                        {
                            WriteDebugLog("[Bootstrap] ReleaseLock() called...");
                            _lockdown?.ReleaseLock();
                            Dispatcher.Invoke(() =>
                            {
                                _overlayWindow?.Hide();
                            });
                            _log?.Info("[Bootstrap] Station unlocked successfully");
                        }
                        catch (Exception ex)
                        {
                            _log?.Error("[Bootstrap] ReleaseLock failed", ex);
                        }
                        break;

                    default:
                        _log?.Warn($"[Bootstrap] Unknown session action: {cmd.Action}");
                        break;
                }
            };

            // Handle remote execution commands
            client.RemoteExecReceived += exec =>
            {
                _log?.Info($"[Bootstrap] REMOTE_EXEC received: {exec.Command} {exec.Arguments}");
                try
                {
                    Process.Start(new ProcessStartInfo(exec.Command) { UseShellExecute = true });
                }
                catch (Exception ex)
                {
                    _log?.Error("[Bootstrap] RemoteExec failed", ex);
                }
            };

            WriteDebugLog($"[Bootstrap] Starting WebSocket client to {serverIp}:8080");
            client.Start(server, stationId: Guid.NewGuid().ToString(), agentVersion: "1.0.0", branchId: null);
            _log?.Info("[Bootstrap] Bootstrap complete. Agent running.");
        }
        catch (Exception ex)
        {
            WriteDebugLog($"[Bootstrap] NETWORK FAILURE: {ex}");
            try { _log?.Error("[Bootstrap] Network error", ex); } catch { }
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
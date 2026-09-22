using NinetyAgent.Client.Core;
using NinetyAgent.Client.Networking;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
namespace NinetyAgent.Client.Networking;

public enum ConnectionState
{
    Disconnected,
    Connecting,
    Connected,
    Reconnecting
}

/// <summary>
/// Owns the single persistent, bidirectional WebSocket connection to the master server.
/// Responsibilities:
///   - Connect using the (host, port) resolved by <see cref="UdpDiscoveryClient"/>.
///   - Stream a CLIENT_HEARTBEAT every 2 seconds (blueprint requirement).
///   - Deserialize inbound frames and raise strongly-typed events (SESSION_COMMAND, REMOTE_EXEC).
///   - Send SECURITY_ALERT frames instantly (no batching — theft/tamper alerts cannot wait).
///   - Auto-reconnect with exponential backoff + jitter if the connection drops, without ever
///     throwing out of the fire-and-forget receive loop and taking the whole agent down.
/// This class does not decide *what* to do with a command — it only decodes it and raises an
/// event; <see cref="Core.AgentStateMachine"/> owns the actual state transitions, keeping
/// networking and business logic cleanly separated.
/// </summary>
public sealed class WebSocketAgentClient : IAsyncDisposable
{
    private const int HeartbeatIntervalMs = 2000;
    private const int MaxBackoffSeconds = 30;
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(5);

    private readonly ILogSink _log;
    private readonly Func<ClientHeartbeatPayload> _heartbeatFactory;
    private readonly CancellationTokenSource _lifetimeCts = new();

    private ClientWebSocket? _socket;
    private Task? _runLoopTask;
    private Uri? _serverUri;
    private volatile ConnectionState _state = ConnectionState.Disconnected;

    public ConnectionState State => _state;
    public event Action<ConnectionState>? ConnectionStateChanged;
    public event Action<SessionCommandPayload>? SessionCommandReceived;
    public event Action<RemoteExecPayload>? RemoteExecReceived;
    public event Action<AuthResponsePayload>? AuthResponseReceived;

    public WebSocketAgentClient(ILogSink log, Func<ClientHeartbeatPayload> heartbeatFactory)
    {
        _log = log;
        _heartbeatFactory = heartbeatFactory;
    }

    /// <summary>Starts the connect -> heartbeat -> receive -> reconnect loop. Fire-and-forget by design.</summary>
    public void Start(DiscoveredServer server, string stationId, string agentVersion, string? branchId)
    {
        _serverUri = new Uri($"ws://{server.Address}:{server.WebSocketPort}/agent");
        _stationId = stationId;
        _agentVersion = agentVersion;
        _branchId = branchId;
        _runLoopTask = Task.Run(() => RunLoopAsync(_lifetimeCts.Token));
    }

    private string _stationId = string.Empty;
    private string _agentVersion = "1.0.0";
    private string? _branchId;

    private async Task RunLoopAsync(CancellationToken ct)
    {
        var attempt = 0;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                SetState(attempt == 0 ? ConnectionState.Connecting : ConnectionState.Reconnecting);
                await ConnectAndPumpAsync(ct).ConfigureAwait(false);
                attempt = 0; // clean exit (disposal) — no further reconnects if ct is cancelled
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                attempt++;
                SetState(ConnectionState.Disconnected);
                var delaySeconds = Math.Min(MaxBackoffSeconds, Math.Pow(2, Math.Min(attempt, 5)));
                var jitterMs = Random.Shared.Next(0, 500);
                _log.Warn($"[WebSocket] Connection lost ({ex.GetType().Name}: {ex.Message}). " +
                          $"Reconnecting in {delaySeconds:F0}s (attempt {attempt})...");
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(delaySeconds) + TimeSpan.FromMilliseconds(jitterMs), ct)
                        .ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        SetState(ConnectionState.Disconnected);
    }

    private async Task ConnectAndPumpAsync(CancellationToken ct)
    {
        if (_serverUri is null) throw new InvalidOperationException("Start() was never called.");

        _socket = new ClientWebSocket();
        _socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(10);

        using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        connectCts.CancelAfter(ConnectTimeout);
        await _socket.ConnectAsync(_serverUri, connectCts.Token).ConfigureAwait(false);

        SetState(ConnectionState.Connected);
        _log.Info($"[WebSocket] Connected to {_serverUri}");

        await SendAsync(MessageType.StationRegister, new StationRegisterPayload
        {
            StationId = _stationId,
            StationName = Environment.MachineName,
            AgentVersion = _agentVersion,
            BranchId = _branchId
        }, AgentJsonContext.Default.AgentEnvelopeStationRegisterPayload, ct).ConfigureAwait(false);

        // Heartbeat and receive pumps run concurrently; either faulting tears down the socket
        // and lets the outer RunLoopAsync catch + reconnect.
        var heartbeatTask = HeartbeatPumpAsync(ct);
        var receiveTask = ReceivePumpAsync(ct);

        var completed = await Task.WhenAny(heartbeatTask, receiveTask).ConfigureAwait(false);
        await completed.ConfigureAwait(false); // rethrow whichever faulted first

        // If we get here without an exception, the socket closed gracefully server-side.
        throw new WebSocketException("Server closed the connection.");
    }

    private async Task HeartbeatPumpAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(HeartbeatIntervalMs));
        while (await timer.WaitForNextTickAsync(ct).ConfigureAwait(false))
        {
            var payload = _heartbeatFactory();
            payload.StationId = _stationId;
            await SendAsync(MessageType.ClientHeartbeat, payload, AgentJsonContext.Default.AgentEnvelopeClientHeartbeatPayload, ct)
                .ConfigureAwait(false);
        }
    }

    private async Task ReceivePumpAsync(CancellationToken ct)
    {
        var buffer = new byte[8192];
        while (!ct.IsCancellationRequested && _socket!.State == WebSocketState.Open)
        {
            using var messageStream = new MemoryStream();
            WebSocketReceiveResult result;
            do
            {
                result = await _socket.ReceiveAsync(buffer, ct).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    throw new WebSocketException("Received Close frame from server.");
                }
                messageStream.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);

            messageStream.Position = 0;
            DispatchInbound(messageStream);
        }
    }

    private void DispatchInbound(Stream json)
    {
        try
        {
            var header = JsonSerializer.Deserialize(json, AgentJsonContext.Default.AgentEnvelopeHeader);
            if (header is null) return;
            json.Position = 0;

            switch (header.Type)
            {
                case MessageType.SessionCommand:
                    var sessionEnvelope = JsonSerializer.Deserialize(json, AgentJsonContext.Default.AgentEnvelopeSessionCommandPayload);
                    if (sessionEnvelope?.Payload is not null)
                    {
                        SessionCommandReceived?.Invoke(sessionEnvelope.Payload);
                    }
                    break;

                case MessageType.RemoteExec:
                    var execEnvelope = JsonSerializer.Deserialize(json, AgentJsonContext.Default.AgentEnvelopeRemoteExecPayload);
                    if (execEnvelope?.Payload is not null)
                    {
                        RemoteExecReceived?.Invoke(execEnvelope.Payload);
                    }
                    break;

                case MessageType.AuthResponse:
                    var authEnvelope = JsonSerializer.Deserialize(json, AgentJsonContext.Default.AgentEnvelopeAuthResponsePayload);
                    if (authEnvelope?.Payload is not null)
                    {
                        AuthResponseReceived?.Invoke(authEnvelope.Payload);
                    }
                    break;
                case MessageType.Ack:
                    break; // reserved for future correlation/telemetry-of-telemetry

                default:
                    _log.Warn($"[WebSocket] Unhandled inbound message type '{header.Type}'.");
                    break;
            }
        }
        catch (JsonException ex)
        {
            _log.Error("[WebSocket] Failed to parse inbound frame.", ex);
        }
    }

    /// <summary>Fire instantly — used for USB unplug / Task Manager bypass attempts. No batching, no delay.</summary>
    public Task SendSecurityAlertAsync(SecurityAlertPayload payload, CancellationToken ct = default)
    {
        payload.StationId = _stationId;
        return SendAsync(MessageType.SecurityAlert, payload, AgentJsonContext.Default.AgentEnvelopeSecurityAlertPayload, ct);
    }

    private async Task SendAsync<T>(string type, T payload, JsonTypeInfo<AgentEnvelope<T>> typeInfo, CancellationToken ct)
    {
        if (_socket is not { State: WebSocketState.Open }) return;

        var envelope = new AgentEnvelope<T> { Type = type, Payload = payload };
        var bytes = JsonSerializer.SerializeToUtf8Bytes(envelope, typeInfo);
        try
        {
            await _sendLock.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                await _socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, ct).ConfigureAwait(false);
            }
            finally
            {
                _sendLock.Release();
            }
        }
        catch (Exception ex) when (ex is WebSocketException or ObjectDisposedException or InvalidOperationException)
        {
            // Swallow here — the receive/heartbeat pump that's racing us will observe the same
            // broken socket and trigger the reconnect path; we don't want two error paths racing.
            _log.Warn($"[WebSocket] Send failed for '{type}': {ex.Message}");
        }
    }

    // ClientWebSocket.SendAsync is not safe to call concurrently from two tasks (heartbeat vs.
    // an instant security alert firing at the same moment) — this serializes writes.
    private readonly SemaphoreSlim _sendLock = new(1, 1);

    private void SetState(ConnectionState newState)
    {
        if (_state == newState) return;
        _state = newState;
        ConnectionStateChanged?.Invoke(newState);
    }

    public async ValueTask DisposeAsync()
    {
        _lifetimeCts.Cancel();
        try
        {
            if (_socket is { State: WebSocketState.Open })
            {
                using var closeCts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Agent shutting down", closeCts.Token)
                    .ConfigureAwait(false);
            }
        }
        catch { /* best-effort close on shutdown */ }

        if (_runLoopTask is not null)
        {
            try { await _runLoopTask.ConfigureAwait(false); } catch { /* already logged inside the loop */ }
        }

        _socket?.Dispose();
        _lifetimeCts.Dispose();
        _sendLock.Dispose();
    }
    public Task SendLoginAsync(string usernameOrEmail, string password, CancellationToken ct = default)
    {
        var payload = new AuthLoginPayload { UsernameOrEmail = usernameOrEmail, Password = password };
        return SendAsync(MessageType.AuthLogin, payload, AgentJsonContext.Default.AgentEnvelopeAuthLoginPayload, ct);
    }

    public Task SendRegisterAsync(string username, string email, string password, CancellationToken ct = default)
    {
        var payload = new AuthRegisterPayload
        {
            Username = username,
            Email = email,
            Password = password,
            Role = "GAMER"
        };
        return SendAsync(MessageType.AuthRegister, payload, AgentJsonContext.Default.AgentEnvelopeAuthRegisterPayload, ct);
    }
}

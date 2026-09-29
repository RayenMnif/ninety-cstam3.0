using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

public class StationAgentService
{
    private readonly HttpClient _httpClient = new HttpClient();
    private ClientWebSocket _webSocket = new ClientWebSocket();
    private CancellationTokenSource _cts = new CancellationTokenSource();

    private const string ServerBaseUrl = "http://localhost:3000";
    private const string WsBaseUrl = "ws://localhost:3000";
    private const string LocalIdFileName = "station_id.txt";

    public string? CurrentStationId { get; private set; }

    public async Task StartAsync()
    {
        // 1. Load cached ID if available as offline fallback
        if (File.Exists(LocalIdFileName))
        {
            CurrentStationId = (await File.ReadAllTextAsync(LocalIdFileName)).Trim();
        }

        // 2. Get real MAC address & register station via HTTP
        var serverStationId = await RegisterViaHttpAsync();

        if (!string.IsNullOrEmpty(serverStationId))
        {
            CurrentStationId = serverStationId;
            // Cache station ID locally
            await File.WriteAllTextAsync(LocalIdFileName, CurrentStationId);
        }

        if (string.IsNullOrEmpty(CurrentStationId))
        {
            Console.WriteLine("[Agent] Registration failed and no local station ID found. Stopping service.");
            return;
        }

        Console.WriteLine($"[Agent] Registered with Station ID: {CurrentStationId}");

        // 3. Connect via WebSocket
        await ConnectWebSocketAsync(CurrentStationId);
    }

    private async Task<string?> RegisterViaHttpAsync()
    {
        try
        {
            var macAddress = GetLocalMacAddress();
            var ipAddress = GetLocalIpAddress();

            var response = await _httpClient.PostAsJsonAsync($"{ServerBaseUrl}/api/agent/register", new
            {
                hostname = Environment.MachineName,
                ipAddress = ipAddress,
                macAddress = macAddress
            });

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"[HTTP Error] Registration returned status code {response.StatusCode}");
                return null;
            }

            using var jsonDoc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            var root = jsonDoc.RootElement;

            if (root.TryGetProperty("stationId", out var idElem))
            {
                return idElem.GetString();
            }

            return null;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[HTTP Exception] {ex.Message}");
            return null;
        }
    }

    private async Task ConnectWebSocketAsync(string stationId)
    {
        try
        {
            if (_webSocket.State == WebSocketState.Open) return;

            _webSocket = new ClientWebSocket();
            var uri = new Uri($"{WsBaseUrl}/agent");
            await _webSocket.ConnectAsync(uri, CancellationToken.None);
            Console.WriteLine("[WS] WebSocket Connected.");

            // Fetch local MAC address
            string macAddress = GetLocalMacAddress();

            // Pass macAddress in the STATION_REGISTER payload
            await SendWsMessageAsync("STATION_REGISTER", new
            {
                stationId = stationId,
                hostname = Environment.MachineName,
                macAddress = macAddress // <--- Added macAddress
            });

            // Start background tasks
            _ = ReceiveLoopAsync(_cts.Token);
            _ = StartHeartbeatLoopAsync(_cts.Token);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WS Error] Connection failed: {ex.Message}");
        }
    }

    /// <summary>
    /// Call this method when a user logs in on the client station.
    /// </summary>
    public async Task SendAuthLoginAsync(string username, string password)
    {
        if (_webSocket.State != WebSocketState.Open)
        {
            Console.WriteLine("[WS] Cannot send login: WebSocket is not open.");
            return;
        }

        if (string.IsNullOrEmpty(CurrentStationId))
        {
            Console.WriteLine("[WS] Cannot send login: CurrentStationId is null or empty.");
            return;
        }

        Console.WriteLine($"[WS] Sending AUTH_LOGIN for station: {CurrentStationId}");

        await SendWsMessageAsync("AUTH_LOGIN", new
        {
            UsernameOrEmail = username,
            Password = password,
            StationId = CurrentStationId,
            Hostname = Environment.MachineName,
            MacAddress = GetLocalMacAddress()
        });
    }

    private async Task StartHeartbeatLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested && _webSocket.State == WebSocketState.Open)
        {
            try
            {
                await Task.Delay(5000, token); // Send heartbeat every 5 seconds
                await SendWsMessageAsync("CLIENT_HEARTBEAT", new
                {
                    stationId = CurrentStationId,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (TaskCanceledException) { break; }
            catch (Exception ex)
            {
                Console.WriteLine($"[Heartbeat Error] {ex.Message}");
            }
        }
    }

    private async Task ReceiveLoopAsync(CancellationToken token)
    {
        var buffer = new byte[1024 * 4];

        while (!token.IsCancellationRequested && _webSocket.State == WebSocketState.Open)
        {
            try
            {
                var result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", token);
                    break;
                }

                string jsonMessage = Encoding.UTF8.GetString(buffer, 0, result.Count);
                ProcessIncomingServerMessage(jsonMessage);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WS Receive Error] {ex.Message}");
                break;
            }
        }
    }

    private void ProcessIncomingServerMessage(string jsonMessage)
    {
        try
        {
            using var doc = JsonDocument.Parse(jsonMessage);
            var root = doc.RootElement;

            string type = root.TryGetProperty("type", out var typeElem) ? typeElem.GetString() ?? "" :
                         root.TryGetProperty("Type", out var typeCapElem) ? typeCapElem.GetString() ?? "" : "";

            Console.WriteLine($"[WS Incoming Message] Type: {type}");

            switch (type)
            {
                case "SESSION_COMMAND":
                    var payload = root.TryGetProperty("payload", out var p1) ? p1 : root.GetProperty("Payload");
                    string action = payload.GetProperty("action").GetString() ?? "";
                    ExecuteSessionCommand(action);
                    break;

                case "AUTH_RESPONSE":
                case "ACK":
                    Console.WriteLine($"[Server Response Received]: {jsonMessage}");
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WS Parse Error] Could not parse server message: {ex.Message}");
        }
    }

    private void ExecuteSessionCommand(string action)
    {
        Console.WriteLine($"\n==========================================");
        Console.WriteLine($"  EXECUTING SESSION COMMAND: {action}");
        Console.WriteLine($"==========================================\n");

        switch (action)
        {
            case "LOCK":
                // Add workstation lock code
                break;
            case "UNLOCK":
                // Add workstation unlock code
                break;
        }
    }

    private async Task SendWsMessageAsync(string messageType, object payload)
    {
        if (_webSocket.State != WebSocketState.Open) return;

        var envelope = new
        {
            type = messageType,
            payload = payload
        };

        string json = JsonSerializer.Serialize(envelope);
        byte[] bytes = Encoding.UTF8.GetBytes(json);

        await _webSocket.SendAsync(
            new ArraySegment<byte>(bytes),
            WebSocketMessageType.Text,
            true,
            CancellationToken.None
        );
    }

    /// <summary>
    /// Finds the primary physical network adapter and returns a standard colon-separated MAC address (AA:BB:CC:DD:EE:FF).
    /// </summary>
    private string GetLocalMacAddress()
    {
        // Exclude virtual network cards (WSL, Hyper-V, VMware, Loopback, VPNs)
        var nic = NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up &&
                        n.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                        n.NetworkInterfaceType != NetworkInterfaceType.Tunnel &&
                        !n.Description.ToLower().Contains("virtual") &&
                        !n.Description.ToLower().Contains("hyper-v") &&
                        !n.Description.ToLower().Contains("wsl") &&
                        !n.Description.ToLower().Contains("vmware") &&
                        !n.Description.ToLower().Contains("vpn"))
            .OrderByDescending(n => n.Speed)
            .FirstOrDefault();

        if (nic == null)
        {
            // Fallback to any interface with a valid 6-byte MAC address
            nic = NetworkInterface.GetAllNetworkInterfaces()
                .FirstOrDefault(n => n.GetPhysicalAddress().GetAddressBytes().Length == 6);
        }

        if (nic == null) return "AA:BB:CC:DD:EE:FF";

        byte[] bytes = nic.GetPhysicalAddress().GetAddressBytes();
        return string.Join(":", bytes.Select(b => b.ToString("X2")));
    }

    /// <summary>
    /// Gets the actual local IPv4 address instead of hardcoded 127.0.0.1.
    /// </summary>
    private string GetLocalIpAddress()
    {
        try
        {
            using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0);
            socket.Connect("8.8.8.8", 65530);
            var endPoint = socket.LocalEndPoint as IPEndPoint;
            return endPoint?.Address.ToString() ?? "127.0.0.1";
        }
        catch
        {
            return "127.0.0.1";
        }
    }
    public async Task<string?> GetExistingStationIdAsync(string macAddress)
    {
        try
        {
            var response = await _httpClient.GetAsync($"{ServerBaseUrl}/api/agent/lookup?mac={macAddress}");
            if (!response.IsSuccessStatusCode) return null;

            using var jsonDoc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            var root = jsonDoc.RootElement;

            if (root.GetProperty("success").GetBoolean())
            {
                return root.GetProperty("station").GetProperty("id").GetString();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Lookup Error] {ex.Message}");
        }

        return null;
    }
}
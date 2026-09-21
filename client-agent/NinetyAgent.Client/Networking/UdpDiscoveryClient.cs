using System.Net;
using System.Net.Sockets;
using System.Text;
using System.IO;
using System;

namespace NinetyAgent.Client.Networking;

public class UdpDiscoveryClient
{
    private const int DiscoveryPort = 5000;

    public async Task<string?> DiscoverServerIpAsync(CancellationToken ct = default)
    {
        using var client = new UdpClient();
        client.EnableBroadcast = true;

        var requestData = Encoding.UTF8.GetBytes("DISCOVER_NINETY_SERVER");
        var broadcastEndpoint = new IPEndPoint(IPAddress.Broadcast, DiscoveryPort);
        var loopbackEndpoint = new IPEndPoint(IPAddress.Loopback, DiscoveryPort);

        // Attempt to send both a broadcast and a direct loopback packet to increase
        // the chance a local test server receives the discovery during debugging.
        try
        {
            await client.SendAsync(requestData, requestData.Length, broadcastEndpoint).ConfigureAwait(false);
            await client.SendAsync(requestData, requestData.Length, loopbackEndpoint).ConfigureAwait(false);
            try { Console.WriteLine($"[UdpDiscovery] Sent discovery to {broadcastEndpoint} and {loopbackEndpoint}"); } catch { }
            try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "ninety_agent_discovery.log"),
                $"{DateTime.UtcNow:O} Sent discovery to {broadcastEndpoint} and {loopbackEndpoint}{Environment.NewLine}"); } catch { }
        }
        catch (Exception ex)
        {
            try { Console.WriteLine($"[UdpDiscovery] Send failed: {ex.Message}"); } catch { }
        }

        var receiveTask = client.ReceiveAsync(ct);
        if (await Task.WhenAny(receiveTask.AsTask(), Task.Delay(3000, ct)).ConfigureAwait(false) == receiveTask.AsTask())
        {
            var result = await receiveTask;
            try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "ninety_agent_discovery.log"),
                $"{DateTime.UtcNow:O} Received reply from {result.RemoteEndPoint}{Environment.NewLine}"); } catch { }
            return result.RemoteEndPoint.Address.ToString();
        }

        try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "ninety_agent_discovery.log"),
            $"{DateTime.UtcNow:O} No reply received, falling back to 127.0.0.1{Environment.NewLine}"); } catch { }

        return "127.0.0.1"; // Default fallback to localhost for single-PC testing
    }
}   
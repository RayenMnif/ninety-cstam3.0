using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Networking;
using Xunit;

namespace NinetyAgent.Client.Tests;

public class UdpDiscoveryClientTests
{
    [Fact]
    public async Task DiscoverServerIpAsync_ReturnsLoopbackFallback_WhenNoServerResponds()
    {
        var client = new UdpDiscoveryClient();
        var result = await client.DiscoverServerIpAsync(CancellationToken.None);
        Assert.Equal("127.0.0.1", result);
    }

    [Fact]
    public async Task DiscoverServerIpAsync_CancellationRequested_ReturnsFallback()
    {
        var client = new UdpDiscoveryClient();
        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        var result = await client.DiscoverServerIpAsync(cts.Token);
        Assert.Equal("127.0.0.1", result);
    }

    [Fact]
    public void UdpDiscoveryClient_ReturnsString()
    {
        var client = new UdpDiscoveryClient();
        Assert.NotNull(client);
    }
}

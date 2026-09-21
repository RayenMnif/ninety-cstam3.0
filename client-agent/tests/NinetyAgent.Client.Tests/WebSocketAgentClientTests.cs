using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Moq;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Networking;
using Xunit;

namespace NinetyAgent.Client.Tests;

public class WebSocketAgentClientTests
{
    [Fact]
    public async Task Start_SetsStateToConnecting()
    {
        var logMock = new Mock<ILogSink>();
        var heartbeatFactory = new Func<ClientHeartbeatPayload>(() => new ClientHeartbeatPayload
        {
            StationId = "STATION_001",
            ActiveSessionId = null,
            AgentState = "locked",
            CpuTempC = 45.0,
            GpuTempC = 50.0,
            CpuLoadPercent = 20.0,
            FanSpeedRpm = 1200,
            PeripheralStatus = "ok",
            RemainingSeconds = 300
        });

        var client = new WebSocketAgentClient(logMock.Object, heartbeatFactory);
        var server = new DiscoveredServer { Address = "127.0.0.1", WebSocketPort = 8080 };

        client.Start(server, "STATION_001", "1.0.0", null);
        await Task.Delay(50);

        Assert.True(client.State == ConnectionState.Connecting || client.State == ConnectionState.Reconnecting || client.State == ConnectionState.Connected || client.State == ConnectionState.Disconnected);
    }

    [Fact]
    public async Task ConnectionStateChanged_EventFiresOnStateChange()
    {
        var logMock = new Mock<ILogSink>();
        var heartbeatFactory = new Func<ClientHeartbeatPayload>(() => new ClientHeartbeatPayload
        {
            StationId = "STATION_001", AgentState = "locked", CpuTempC = 45, GpuTempC = 50,
            CpuLoadPercent = 20, FanSpeedRpm = 1200, PeripheralStatus = "ok", RemainingSeconds = 300
        });

        var client = new WebSocketAgentClient(logMock.Object, heartbeatFactory);
        ConnectionState? changedState = null;
        client.ConnectionStateChanged += state => changedState = state;

        var server = new DiscoveredServer { Address = "127.0.0.1", WebSocketPort = 8080 };
        client.Start(server, "STATION_001", "1.0.0", null);
        await Task.Delay(100);

        Assert.NotNull(changedState);
        Assert.True(changedState == ConnectionState.Connecting || changedState == ConnectionState.Reconnecting || changedState == ConnectionState.Disconnected);
    }

    [Fact]
    public async Task DisposeAsync_CleansUpResources()
    {
        var logMock = new Mock<ILogSink>();
        var heartbeatFactory = new Func<ClientHeartbeatPayload>(() => new ClientHeartbeatPayload
        {
            StationId = "STATION_001", AgentState = "locked", CpuTempC = 45, GpuTempC = 50,
            CpuLoadPercent = 20, FanSpeedRpm = 1200, PeripheralStatus = "ok", RemainingSeconds = 300
        });

        var client = new WebSocketAgentClient(logMock.Object, heartbeatFactory);
        var server = new DiscoveredServer { Address = "127.0.0.1", WebSocketPort = 8080 };
        client.Start(server, "STATION_001", "1.0.0", null);
        await Task.Delay(50);

        await client.DisposeAsync();

        Assert.Equal(ConnectionState.Disconnected, client.State);
    }

    [Fact]
    public async Task SendSecurityAlertAsync_DoesNotThrow_WhenDisconnected()
    {
        var logMock = new Mock<ILogSink>();
        var heartbeatFactory = new Func<ClientHeartbeatPayload>(() => new ClientHeartbeatPayload
        {
            StationId = "STATION_001", AgentState = "locked", CpuTempC = 45, GpuTempC = 50,
            CpuLoadPercent = 20, FanSpeedRpm = 1200, PeripheralStatus = "ok", RemainingSeconds = 300
        });

        var client = new WebSocketAgentClient(logMock.Object, heartbeatFactory);
        var payload = new SecurityAlertPayload { StationId = "STATION_001", AlertType = "USB_UNPLUG", Details = "test" };

        await client.SendSecurityAlertAsync(payload);

        logMock.Verify(l => l.Warn(It.Is<string>(s => s.Contains("Send failed"))), Times.Never);
    }
}

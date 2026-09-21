using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NinetyAgent.Watchdog;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddWindowsService(options => options.ServiceName = "NinetyAgentWatchdog");

builder.Services.AddSingleton<AgentProcessSupervisor>();
builder.Services.AddHostedService<WatchdogService>();

var host = builder.Build();
host.Run();

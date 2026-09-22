using System;
using System.Windows;
using System.Windows.Input;
using NinetyAgent.Client.Networking;

namespace NinetyAgent.Client.UI;

public partial class LoginWindow : Window
{
    private readonly WebSocketAgentClient _client;

    public LoginWindow(WebSocketAgentClient client)
    {
        InitializeComponent();
        _client = client;

        _client.AuthResponseReceived += OnAuthResponseReceived;
        _client.ConnectionStateChanged += OnConnectionStateChanged;
    }

    private void TabMode_Changed(object sender, RoutedEventArgs e)
    {
        if (PanelLogin == null || PanelRegister == null) return;

        if (RadioLogin.IsChecked == true)
        {
            PanelLogin.Visibility = Visibility.Visible;
            PanelRegister.Visibility = Visibility.Collapsed;
        }
        else
        {
            PanelLogin.Visibility = Visibility.Collapsed;
            PanelRegister.Visibility = Visibility.Visible;
        }
        TxtStatus.Text = string.Empty;
    }

    private async void BtnSubmitLogin_Click(object sender, RoutedEventArgs e)
    {
        string identifier = TxtLoginUser.Text.Trim();
        string password = TxtLoginPassword.Password;

        if (string.IsNullOrEmpty(identifier) || string.IsNullOrEmpty(password))
        {
            SetError("Please enter both username/email and password.");
            return;
        }

        SetLoading(true, "Authenticating...");
        await _client.SendLoginAsync(identifier, password);
    }

    private async void BtnSubmitRegister_Click(object sender, RoutedEventArgs e)
    {
        string username = TxtRegUser.Text.Trim();
        string email = TxtRegEmail.Text.Trim();
        string password = TxtRegPassword.Password;

        if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            SetError("All fields are required for registration.");
            return;
        }

        SetLoading(true, "Creating account...");
        await _client.SendRegisterAsync(username, email, password);
    }

    private void OnAuthResponseReceived(AuthResponsePayload response)
    {
        Dispatcher.Invoke(() =>
        {
            SetLoading(false);

            if (response.Success)
            {
                MessageBox.Show($"Welcome, {response.Username}!", "Success", MessageBoxButton.OK, MessageBoxImage.Information);
                DialogResult = true;
                Close();
            }
            else
            {
                SetError(response.Message);
            }
        });
    }

    private void OnConnectionStateChanged(ConnectionState state)
    {
        Dispatcher.Invoke(() =>
        {
            if (state != ConnectionState.Connected)
            {
                SetError($"Server disconnected ({state}). Reconnecting...");
            }
            else
            {
                TxtStatus.Text = string.Empty;
            }
        });
    }

    private void SetLoading(bool isLoading, string message = "")
    {
        BtnSubmitLogin.IsEnabled = !isLoading;
        BtnSubmitRegister.IsEnabled = !isLoading;
        TxtStatus.Foreground = System.Windows.Media.Brushes.Gray;
        TxtStatus.Text = message;
    }

    private void SetError(string message)
    {
        TxtStatus.Foreground = System.Windows.Media.Brushes.IndianRed;
        TxtStatus.Text = message;
    }

    private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();

    private void BtnExit_Click(object sender, RoutedEventArgs e) => Application.Current.Shutdown();

    protected override void OnClosed(EventArgs e)
    {
        _client.AuthResponseReceived -= OnAuthResponseReceived;
        _client.ConnectionStateChanged -= OnConnectionStateChanged;
        base.OnClosed(e);
    }
}
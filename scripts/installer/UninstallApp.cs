using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

namespace LmentorInstaller
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            if (args != null && args.Length > 0 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    UninstallerResources.SelfTest();
                    Environment.Exit(0);
                }
                catch
                {
                    Environment.Exit(1);
                }
            }

            if (args != null && args.Length > 1 && string.Equals(args[0], "--cleanup", StringComparison.OrdinalIgnoreCase))
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new UninstallerForm(args[1]));
                return;
            }

            string installDir = Path.GetDirectoryName(Application.ExecutablePath);
            if (string.IsNullOrEmpty(installDir))
            {
                installDir = Environment.CurrentDirectory;
            }

            LaunchCleanupCopy(installDir);
        }

        private static void LaunchCleanupCopy(string installDir)
        {
            try
            {
                string tempExe = Path.Combine(Path.GetTempPath(), "LmentorUninstall-" + Guid.NewGuid().ToString("N") + ".exe");
                File.Copy(Application.ExecutablePath, tempExe, true);

                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = tempExe;
                startInfo.Arguments = "--cleanup " + QuoteArgument(installDir);
                startInfo.UseShellExecute = false;
                startInfo.WorkingDirectory = Path.GetDirectoryName(tempExe);

                Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "无法启动卸载程序的独立清理进程：\r\n\r\n" + ex.Message,
                    "师门 卸载向导",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private static string QuoteArgument(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }
    }

    internal static class UninstallerResources
    {
        public const string BackgroundImage = "Lmentor.BackgroundImage";

        public static Stream OpenResource(string resourceName)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            Stream stream = assembly.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                throw new InvalidOperationException("Uninstaller resource not found: " + resourceName);
            }
            return stream;
        }

        public static void SelfTest()
        {
            using (Stream image = OpenResource(BackgroundImage))
            {
                if (image.Length <= 0)
                {
                    throw new InvalidOperationException("Background image is empty.");
                }
            }
        }
    }

    internal sealed class UninstallerForm : Form
    {
        private const string ProductDisplayName = "师门";
        private const string InstallerDisplayName = "师门 卸载向导";

        private readonly string targetInstallDir;
        private readonly string tempCleanupExe;
        private readonly string logPath;

        private Panel leftPanel;
        private PictureBox backgroundBox;
        private Panel rightPanel;
        private Label titleLabel;
        private Label subtitleLabel;
        private FlowLayoutPanel stepFlow;
        private Panel contentHost;
        private Panel footerPanel;
        private Button backButton;
        private Button nextButton;
        private Button cancelButton;

        private Panel welcomePage;
        private Panel confirmPage;
        private Panel progressPage;
        private Panel finishPage;

        private Label progressStatusLabel;
        private ProgressBar progressBar;
        private Label finishLabel;

        private readonly List<Label> stepLabels;
        private readonly List<Panel> pages;
        private int currentPageIndex;
        private bool uninstallCompleted;

        public UninstallerForm(string installDir)
        {
            this.targetInstallDir = string.IsNullOrWhiteSpace(installDir) ? Environment.CurrentDirectory : installDir;
            this.tempCleanupExe = Application.ExecutablePath;
            this.logPath = Path.Combine(Path.GetTempPath(), "LmentorUninstaller.log");
            this.stepLabels = new List<Label>();
            this.pages = new List<Panel>();
            this.currentPageIndex = 0;
            this.uninstallCompleted = false;

            WriteLog("Uninstaller UI starting. Target=" + this.targetInstallDir);
            InitializeUi();
            UpdatePageState();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            base.OnFormClosed(e);
            TryDeleteTempCleanupCopy();
        }

        private void InitializeUi()
        {
            this.Text = InstallerDisplayName;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.ClientSize = new Size(1040, 680);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            this.BackColor = Color.FromArgb(247, 245, 240);

            this.leftPanel = new Panel();
            this.leftPanel.Dock = DockStyle.Left;
            this.leftPanel.Width = 360;
            this.leftPanel.BackColor = Color.Black;

            this.backgroundBox = new PictureBox();
            this.backgroundBox.Dock = DockStyle.Fill;
            this.backgroundBox.SizeMode = PictureBoxSizeMode.Zoom;
            using (Stream imageStream = UninstallerResources.OpenResource(UninstallerResources.BackgroundImage))
            {
                this.backgroundBox.Image = Image.FromStream(imageStream);
            }
            this.leftPanel.Controls.Add(this.backgroundBox);

            Panel heroOverlay = new Panel();
            heroOverlay.Dock = DockStyle.Bottom;
            heroOverlay.Height = 180;
            heroOverlay.BackColor = Color.FromArgb(180, 20, 18, 18);

            Label heroTitle = new Label();
            heroTitle.Text = InstallerDisplayName;
            heroTitle.ForeColor = Color.White;
            heroTitle.Font = new Font("Microsoft YaHei UI", 18F, FontStyle.Bold, GraphicsUnit.Point);
            heroTitle.AutoSize = false;
            heroTitle.Width = 320;
            heroTitle.Height = 40;
            heroTitle.Location = new Point(24, 24);

            Label heroDesc = new Label();
            heroDesc.Text = "此向导会直接删除整个安装目录及其本地数据，并清理快捷方式；若 Python 3.13 由本安装器安装，也会一并卸载。";
            heroDesc.ForeColor = Color.FromArgb(230, 240, 240, 240);
            heroDesc.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            heroDesc.AutoSize = false;
            heroDesc.Width = 308;
            heroDesc.Height = 88;
            heroDesc.Location = new Point(24, 72);

            heroOverlay.Controls.Add(heroTitle);
            heroOverlay.Controls.Add(heroDesc);
            this.leftPanel.Controls.Add(heroOverlay);

            this.rightPanel = new Panel();
            this.rightPanel.Dock = DockStyle.Fill;
            this.rightPanel.BackColor = Color.FromArgb(247, 245, 240);

            this.titleLabel = new Label();
            this.titleLabel.Text = "欢迎卸载 " + ProductDisplayName;
            this.titleLabel.Font = new Font("Microsoft YaHei UI", 20F, FontStyle.Bold, GraphicsUnit.Point);
            this.titleLabel.ForeColor = Color.FromArgb(36, 31, 28);
            this.titleLabel.AutoSize = false;
            this.titleLabel.Width = 620;
            this.titleLabel.Height = 44;
            this.titleLabel.Location = new Point(36, 28);

            this.subtitleLabel = new Label();
            this.subtitleLabel.Text = "卸载向导将依次完成确认、清理与结束，不会删除系统中单独安装的 Python。";
            this.subtitleLabel.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            this.subtitleLabel.ForeColor = Color.FromArgb(104, 94, 86);
            this.subtitleLabel.AutoSize = false;
            this.subtitleLabel.Width = 620;
            this.subtitleLabel.Height = 24;
            this.subtitleLabel.Location = new Point(38, 76);

            this.stepFlow = new FlowLayoutPanel();
            this.stepFlow.Location = new Point(36, 112);
            this.stepFlow.Size = new Size(620, 40);
            this.stepFlow.WrapContents = false;
            this.stepFlow.FlowDirection = FlowDirection.LeftToRight;

            string[] stepNames = new string[]
            {
                "说明",
                "确认",
                "清理",
                "完成"
            };

            for (int i = 0; i < stepNames.Length; i++)
            {
                Label label = new Label();
                label.Text = "  " + (i + 1).ToString() + " 路 " + stepNames[i] + "  ";
                label.AutoSize = true;
                label.Margin = new Padding(0, 0, 10, 0);
                label.Padding = new Padding(10, 8, 10, 8);
                label.BackColor = Color.FromArgb(228, 221, 210);
                label.ForeColor = Color.FromArgb(93, 79, 67);
                label.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
                this.stepFlow.Controls.Add(label);
                this.stepLabels.Add(label);
            }

            this.contentHost = new Panel();
            this.contentHost.Location = new Point(36, 166);
            this.contentHost.Size = new Size(620, 418);
            this.contentHost.BackColor = Color.FromArgb(255, 252, 247);
            this.contentHost.BorderStyle = BorderStyle.FixedSingle;

            this.footerPanel = new Panel();
            this.footerPanel.Dock = DockStyle.Bottom;
            this.footerPanel.Height = 72;
            this.footerPanel.BackColor = Color.FromArgb(242, 237, 231);

            this.backButton = new Button();
            this.backButton.Text = "上一步";
            this.backButton.Size = new Size(100, 36);
            this.backButton.Location = new Point(354, 18);
            this.backButton.FlatStyle = FlatStyle.Flat;
            this.backButton.FlatAppearance.BorderColor = Color.FromArgb(173, 156, 141);
            this.backButton.BackColor = Color.White;
            this.backButton.Click += delegate { MovePrevious(); };

            this.nextButton = new Button();
            this.nextButton.Text = "下一步";
            this.nextButton.Size = new Size(120, 36);
            this.nextButton.Location = new Point(466, 18);
            this.nextButton.FlatStyle = FlatStyle.Flat;
            this.nextButton.FlatAppearance.BorderSize = 0;
            this.nextButton.BackColor = Color.FromArgb(105, 78, 58);
            this.nextButton.ForeColor = Color.White;
            this.nextButton.Click += delegate { MoveNext(); };

            this.cancelButton = new Button();
            this.cancelButton.Text = "退出";
            this.cancelButton.Size = new Size(100, 36);
            this.cancelButton.Location = new Point(26, 18);
            this.cancelButton.FlatStyle = FlatStyle.Flat;
            this.cancelButton.FlatAppearance.BorderColor = Color.FromArgb(173, 156, 141);
            this.cancelButton.BackColor = Color.White;
            this.cancelButton.Click += delegate { this.Close(); };

            this.footerPanel.Controls.Add(this.cancelButton);
            this.footerPanel.Controls.Add(this.backButton);
            this.footerPanel.Controls.Add(this.nextButton);

            BuildPages();

            this.rightPanel.Controls.Add(this.titleLabel);
            this.rightPanel.Controls.Add(this.subtitleLabel);
            this.rightPanel.Controls.Add(this.stepFlow);
            this.rightPanel.Controls.Add(this.contentHost);
            this.rightPanel.Controls.Add(this.footerPanel);

            this.Controls.Add(this.rightPanel);
            this.Controls.Add(this.leftPanel);
        }

        private void BuildPages()
        {
            this.welcomePage = CreatePagePanel();
            this.confirmPage = CreatePagePanel();
            this.progressPage = CreatePagePanel();
            this.finishPage = CreatePagePanel();

            BuildWelcomePage();
            BuildConfirmPage();
            BuildProgressPage();
            BuildFinishPage();

            this.pages.Add(this.welcomePage);
            this.pages.Add(this.confirmPage);
            this.pages.Add(this.progressPage);
            this.pages.Add(this.finishPage);

            for (int i = 0; i < this.pages.Count; i++)
            {
                this.contentHost.Controls.Add(this.pages[i]);
            }
        }

        private Panel CreatePagePanel()
        {
            Panel panel = new Panel();
            panel.Dock = DockStyle.Fill;
            panel.Padding = new Padding(24);
            panel.BackColor = Color.FromArgb(255, 252, 247);
            panel.Visible = false;
            return panel;
        }

        private void BuildWelcomePage()
        {
            Label headline = CreateSectionTitle("卸载前说明");
            headline.Location = new Point(24, 22);

            Label body = CreateBodyLabel(
                "本向导将以图形化分步方式直接删除 " + ProductDisplayName + " 的整个安装目录、程序文件、桌面快捷方式与开始菜单项。\r\n\r\n" +
                "安装目录内的本地配置、会话数据以及随程序附带的 Python/R 运行时都会一并移除。若 Python 3.13 是由本安装器安装的配套运行时，也会被单独卸载；用户原先已有的 Python 或 R 环境不会被触及。\r\n\r\n" +
                "如果你确认要移除此程序，请继续下一步。");
            body.Location = new Point(24, 72);
            body.Size = new Size(560, 220);

            Panel tipCard = CreateCardPanel(24, 306, 560, 84);
            Label tip = new Label();
            tip.Text = "提示：若程序当前仍在运行，请先关闭主程序，以便卸载过程可以完整清理相关文件。";
            tip.ForeColor = Color.FromArgb(90, 72, 54);
            tip.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold, GraphicsUnit.Point);
            tip.AutoSize = false;
            tip.Location = new Point(18, 16);
            tip.Size = new Size(520, 46);
            tipCard.Controls.Add(tip);

            this.welcomePage.Controls.Add(headline);
            this.welcomePage.Controls.Add(body);
            this.welcomePage.Controls.Add(tipCard);
        }

        private void BuildConfirmPage()
        {
            Label headline = CreateSectionTitle("确认卸载范围");
            headline.Location = new Point(24, 22);

            Label body = CreateBodyLabel(
                "继续后，卸载向导将删除以下内容：\r\n\r\n" +
                "1. " + this.targetInstallDir + " 下的全部程序文件\r\n" +
                "2. 桌面上的“" + ProductDisplayName + "”快捷方式\r\n" +
                "3. 开始菜单中的相关快捷方式与目录\r\n\r\n" +
                "用户原先已有的 Python 与 R 不会被删除。");
            body.Location = new Point(24, 72);
            body.Size = new Size(560, 238);

            Panel confirmCard = CreateCardPanel(24, 324, 560, 66);
            Label confirmHint = new Label();
            confirmHint.Text = "若你已确认需要清理，请点击“开始卸载”继续。";
            confirmHint.ForeColor = Color.FromArgb(90, 72, 54);
            confirmHint.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            confirmHint.AutoSize = false;
            confirmHint.Location = new Point(18, 14);
            confirmHint.Size = new Size(520, 34);
            confirmCard.Controls.Add(confirmHint);

            this.confirmPage.Controls.Add(headline);
            this.confirmPage.Controls.Add(body);
            this.confirmPage.Controls.Add(confirmCard);
        }

        private void BuildProgressPage()
        {
            Label headline = CreateSectionTitle("正在执行卸载，请稍候");
            headline.Location = new Point(24, 22);

            Label desc = CreateBodyLabel(
                "卸载向导正在清理安装目录与快捷方式。\r\n\r\n" +
                "请在此过程中保持窗口开启，直至进度完成。");
            desc.Location = new Point(24, 72);
            desc.Size = new Size(560, 96);

            Panel progressCard = CreateCardPanel(24, 190, 560, 148);
            this.progressStatusLabel = new Label();
            this.progressStatusLabel.AutoSize = false;
            this.progressStatusLabel.Location = new Point(18, 16);
            this.progressStatusLabel.Size = new Size(520, 54);
            this.progressStatusLabel.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold, GraphicsUnit.Point);

            this.progressBar = new ProgressBar();
            this.progressBar.Location = new Point(18, 82);
            this.progressBar.Size = new Size(520, 20);
            this.progressBar.Minimum = 0;
            this.progressBar.Maximum = 100;

            progressCard.Controls.Add(this.progressStatusLabel);
            progressCard.Controls.Add(this.progressBar);

            this.progressPage.Controls.Add(headline);
            this.progressPage.Controls.Add(desc);
            this.progressPage.Controls.Add(progressCard);
        }

        private void BuildFinishPage()
        {
            Label headline = CreateSectionTitle("卸载完成");
            headline.Location = new Point(24, 22);

            this.finishLabel = CreateBodyLabel("");
            this.finishLabel.Location = new Point(24, 72);
            this.finishLabel.Size = new Size(560, 176);

            Panel tipCard = CreateCardPanel(24, 268, 560, 88);
            Label tip = new Label();
            tip.Text = "若桌面或开始菜单中仍保留旧快捷方式，请手动刷新一次资源管理器后再确认。";
            tip.ForeColor = Color.FromArgb(90, 72, 54);
            tip.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
            tip.AutoSize = false;
            tip.Location = new Point(18, 18);
            tip.Size = new Size(520, 34);
            tipCard.Controls.Add(tip);

            this.finishPage.Controls.Add(headline);
            this.finishPage.Controls.Add(this.finishLabel);
            this.finishPage.Controls.Add(tipCard);
        }

        private Label CreateSectionTitle(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = new Font("Microsoft YaHei UI", 14F, FontStyle.Bold, GraphicsUnit.Point);
            label.ForeColor = Color.FromArgb(60, 45, 35);
            label.AutoSize = false;
            label.Width = 560;
            label.Height = 28;
            return label;
        }

        private Label CreateBodyLabel(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            label.ForeColor = Color.FromArgb(68, 60, 54);
            label.AutoSize = false;
            return label;
        }

        private Panel CreateCardPanel(int x, int y, int width, int height)
        {
            Panel card = new Panel();
            card.Location = new Point(x, y);
            card.Size = new Size(width, height);
            card.BackColor = Color.FromArgb(248, 243, 236);
            card.BorderStyle = BorderStyle.FixedSingle;
            return card;
        }

        private void MovePrevious()
        {
            if (this.currentPageIndex <= 0 || this.uninstallCompleted)
            {
                return;
            }

            this.currentPageIndex--;
            UpdatePageState();
        }

        private void MoveNext()
        {
            if (this.currentPageIndex == this.pages.Count - 1)
            {
                FinishAndClose();
                return;
            }

            if (!ValidateCurrentPage())
            {
                return;
            }

            if (this.currentPageIndex == 1)
            {
                this.currentPageIndex = 2;
                UpdatePageState();
                BeginUninstall();
                return;
            }

            this.currentPageIndex++;
            UpdatePageState();
        }

        private bool ValidateCurrentPage()
        {
            if (this.currentPageIndex == 1)
            {
                DialogResult confirm = MessageBox.Show(
                    this,
                    "请再次确认：\r\n\r\n将直接删除整个安装目录及其本地数据，并清理相关快捷方式。若 Python 3.13 由本安装器安装，也会被单独卸载；用户原有 Python 与 R 不受影响。\r\n\r\n是否继续卸载？",
                    InstallerDisplayName,
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);
                if (confirm != DialogResult.Yes)
                {
                    return false;
                }
            }

            return true;
        }

        private void UpdatePageState()
        {
            for (int i = 0; i < this.pages.Count; i++)
            {
                this.pages[i].Visible = i == this.currentPageIndex;
            }

            for (int i = 0; i < this.stepLabels.Count; i++)
            {
                if (i == this.currentPageIndex)
                {
                    this.stepLabels[i].BackColor = Color.FromArgb(111, 83, 60);
                    this.stepLabels[i].ForeColor = Color.White;
                }
                else if (i < this.currentPageIndex)
                {
                    this.stepLabels[i].BackColor = Color.FromArgb(207, 228, 212);
                    this.stepLabels[i].ForeColor = Color.FromArgb(45, 96, 66);
                }
                else
                {
                    this.stepLabels[i].BackColor = Color.FromArgb(228, 221, 210);
                    this.stepLabels[i].ForeColor = Color.FromArgb(93, 79, 67);
                }
            }

            this.backButton.Enabled = this.currentPageIndex > 0 && this.currentPageIndex < 2 && !this.uninstallCompleted;
            this.cancelButton.Enabled = !this.uninstallCompleted;

            if (this.currentPageIndex == 0)
            {
                this.nextButton.Text = "继续";
            }
            else if (this.currentPageIndex == 1)
            {
                this.nextButton.Text = "开始卸载";
            }
            else if (this.currentPageIndex == 3)
            {
                this.nextButton.Text = "完成";
            }
            else
            {
                this.nextButton.Text = "下一步";
            }

            this.nextButton.Enabled = this.currentPageIndex < 2 || (this.currentPageIndex == 3 && this.uninstallCompleted);
        }

        private void BeginUninstall()
        {
            this.backButton.Enabled = false;
            this.cancelButton.Enabled = false;
            this.nextButton.Enabled = false;
            SetProgress(0, "正在准备卸载。");

            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    RunUninstallSequence();
                    this.Invoke((MethodInvoker)delegate
                    {
                        this.uninstallCompleted = true;
                        this.currentPageIndex = 3;
                        this.finishLabel.Text =
                            ProductDisplayName + " 已从以下目录移除：\r\n" + this.targetInstallDir + "\r\n\r\n" +
                            "整个安装目录、本地数据与快捷方式均已清理完成。若存在由本安装器安装的 Python 3.13，也已完成单独卸载。";
                        UpdatePageState();
                    });
                }
                catch (Exception ex)
                {
                    WriteLog("UNINSTALL FAILED: " + ex);
                    this.Invoke((MethodInvoker)delegate
                    {
                        MessageBox.Show(this, "卸载过程中发生错误：\r\n\r\n" + ex.Message, InstallerDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                        this.currentPageIndex = 1;
                        this.uninstallCompleted = false;
                        UpdatePageState();
                    });
                }
            });
        }

        private void RunUninstallSequence()
        {
            WriteLog("UNINSTALL START");

            SetProgress(12, "正在检查安装器绑定的 Python 3.13 运行时。");
            RemoveInstallerOwnedPythonRuntime();

            SetProgress(30, "正在移除桌面与开始菜单快捷方式。");
            RemoveShortcutArtifacts();

            SetProgress(58, "正在清理安装目录。");
            RemoveInstallDirectory(this.targetInstallDir);

            SetProgress(90, "正在整理残留痕迹。");
            RemoveShortcutArtifacts();

            SetProgress(100, "卸载已完成。");
            WriteLog("UNINSTALL COMPLETE");
        }

        private void RemoveShortcutArtifacts()
        {
            string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            DeleteFileIfExists(Path.Combine(desktopPath, ProductDisplayName + ".lnk"));
            DeleteFileIfExists(Path.Combine(desktopPath, "Lmentor.lnk"));

            string programsPath = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            DeleteDirectoryIfExists(Path.Combine(programsPath, ProductDisplayName));
            DeleteDirectoryIfExists(Path.Combine(programsPath, "Lmentor"));
        }

        private void RemoveInstallerOwnedPythonRuntime()
        {
            string markerPath = Path.Combine(this.targetInstallDir, ".lmentor-runtime-ownership.txt");
            if (!File.Exists(markerPath))
            {
                WriteLog("No Python ownership marker found; preserving system Python.");
                return;
            }

            string[] markerLines = File.ReadAllLines(markerPath);
            bool ownedByLmentor = false;
            string pythonHome = string.Empty;
            for (int i = 0; i < markerLines.Length; i++)
            {
                if (markerLines[i].StartsWith("python_installed_by_lmentor=", StringComparison.OrdinalIgnoreCase))
                {
                    ownedByLmentor = markerLines[i].Substring("python_installed_by_lmentor=".Length).Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
                }
                else if (markerLines[i].StartsWith("python_home=", StringComparison.OrdinalIgnoreCase))
                {
                    pythonHome = markerLines[i].Substring("python_home=".Length).Trim();
                }
            }

            if (!ownedByLmentor)
            {
                WriteLog("Python was present before Lmentor installation; preserving " + pythonHome);
                return;
            }

            string pythonUninstaller = Path.Combine(pythonHome, "uninstall.exe");
            if (!File.Exists(pythonUninstaller))
            {
                throw new InvalidOperationException("无法找到由本安装器安装的 Python 3.13 卸载程序：" + pythonUninstaller);
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = pythonUninstaller;
            startInfo.Arguments = "/quiet";
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            using (Process process = Process.Start(startInfo))
            {
                if (process == null)
                {
                    throw new InvalidOperationException("无法启动 Python 3.13 卸载程序。");
                }

                process.WaitForExit();
                if (process.ExitCode != 0 && process.ExitCode != 3010 && process.ExitCode != 1641)
                {
                    throw new InvalidOperationException("Python 3.13 卸载失败，退出代码：" + process.ExitCode.ToString());
                }
            }

            WriteLog("Uninstalled Python owned by Lmentor: " + pythonHome);
        }

        private void RemoveInstallDirectory(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return;
            }

            if (!Directory.Exists(path))
            {
                WriteLog("Install directory does not exist: " + path);
                return;
            }

            ClearReadOnlyAttributes(path);
            Directory.Delete(path, true);
            WriteLog("Deleted install directory: " + path);
        }

        private void ClearReadOnlyAttributes(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    File.SetAttributes(path, FileAttributes.Normal);
                    return;
                }

                foreach (string file in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
                {
                    try
                    {
                        File.SetAttributes(file, FileAttributes.Normal);
                    }
                    catch
                    {
                    }
                }

                foreach (string directory in Directory.GetDirectories(path, "*", SearchOption.AllDirectories))
                {
                    try
                    {
                        File.SetAttributes(directory, FileAttributes.Normal);
                    }
                    catch
                    {
                    }
                }
            }
            catch
            {
            }
        }

        private void DeleteFileIfExists(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    File.SetAttributes(path, FileAttributes.Normal);
                    File.Delete(path);
                    WriteLog("Deleted file: " + path);
                }
            }
            catch (Exception ex)
            {
                WriteLog("Failed to delete file: " + path + " :: " + ex.Message);
            }
        }

        private void DeleteDirectoryIfExists(string path)
        {
            try
            {
                if (Directory.Exists(path))
                {
                    ClearReadOnlyAttributes(path);
                    Directory.Delete(path, true);
                    WriteLog("Deleted directory: " + path);
                }
            }
            catch (Exception ex)
            {
                WriteLog("Failed to delete directory: " + path + " :: " + ex.Message);
            }
        }

        private void SetProgress(int value, string message)
        {
            if (this.InvokeRequired)
            {
                this.Invoke((MethodInvoker)delegate { SetProgress(value, message); });
                return;
            }

            if (value < this.progressBar.Minimum)
            {
                value = this.progressBar.Minimum;
            }
            if (value > this.progressBar.Maximum)
            {
                value = this.progressBar.Maximum;
            }

            this.progressBar.Value = value;
            this.progressStatusLabel.Text = message;
            this.progressPage.Refresh();
            WriteLog("PROGRESS " + value.ToString() + ": " + message);
        }

        private void FinishAndClose()
        {
            this.Close();
        }

        private void TryDeleteTempCleanupCopy()
        {
            try
            {
                string exePath = this.tempCleanupExe;
                if (string.IsNullOrWhiteSpace(exePath) || !File.Exists(exePath))
                {
                    return;
                }

                string deleteScript = Path.Combine(Path.GetTempPath(), "LmentorUninstallDelete-" + Guid.NewGuid().ToString("N") + ".cmd");
                string content =
                    "@echo off\r\n" +
                    "ping 127.0.0.1 -n 2 >nul\r\n" +
                    "del /f /q \"" + exePath + "\"\r\n" +
                    "del /f /q \"%~f0\"\r\n";
                File.WriteAllText(deleteScript, content, System.Text.Encoding.ASCII);

                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = deleteScript;
                startInfo.UseShellExecute = false;
                startInfo.CreateNoWindow = true;
                startInfo.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(startInfo);
            }
            catch
            {
            }
        }

        private void WriteLog(string message)
        {
            try
            {
                string directory = Path.GetDirectoryName(this.logPath);
                if (!string.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }
                File.AppendAllText(this.logPath, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + message + Environment.NewLine);
            }
            catch
            {
            }
        }
    }
}

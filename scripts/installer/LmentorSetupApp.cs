using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
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
                    InstallerResources.SelfTest();
                    Environment.Exit(0);
                }
                catch
                {
                    Environment.Exit(1);
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }

    internal static class InstallerResources
    {
        public const string PayloadZip = "Lmentor.PayloadZip";
        public const string PythonInstaller = "Lmentor.PythonInstaller";
        public const string NodeInstaller = "Lmentor.NodeInstaller";
        public const string BackgroundImage = "Lmentor.BackgroundImage";
        public const string EnvironmentArchiveFileName = "Lmentor-Environment.zip";

        public static Stream OpenResource(string resourceName)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            Stream stream = assembly.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                throw new InvalidOperationException("Installer resource not found: " + resourceName);
            }
            return stream;
        }

        public static void SelfTest()
        {
            using (Stream payload = OpenResource(PayloadZip))
            {
                if (payload.Length <= 0)
                {
                    throw new InvalidOperationException("Payload zip is empty.");
                }
                using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read, true))
                {
                    bool launcherFound = false;
                    bool coreFound = false;
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string normalized = entry.FullName.Replace('\\', '/');
                        launcherFound = launcherFound || string.Equals(normalized, "Lmentor.exe", StringComparison.OrdinalIgnoreCase);
                        coreFound = coreFound || string.Equals(normalized, "core/Lmentor-core.exe", StringComparison.OrdinalIgnoreCase);
                    }
                    if (!launcherFound || !coreFound)
                    {
                        throw new InvalidOperationException("Required application files are missing from the payload.");
                    }
                }
            }

            using (Stream python = OpenResource(PythonInstaller))
            {
                if (python.Length <= 0)
                {
                    throw new InvalidOperationException("Python installer is empty.");
                }
            }

            using (Stream node = OpenResource(NodeInstaller))
            {
                if (node.Length <= 0)
                {
                    throw new InvalidOperationException("Node.js installer is empty.");
                }
            }

            using (Stream image = OpenResource(BackgroundImage))
            {
                if (image.Length <= 0)
                {
                    throw new InvalidOperationException("Background image is empty.");
                }
            }
        }

        public static string ExtractResourceToFile(string resourceName, string filePath)
        {
            string directory = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            using (Stream input = OpenResource(resourceName))
            using (FileStream output = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                input.CopyTo(output);
            }

            return filePath;
        }
    }

    internal sealed class InstallerForm : Form
    {
        private const string ProductDisplayName = "师门";
        private const string InstallerDisplayName = "师门 安装向导";

        private readonly string logPath;
        private readonly string tempRoot;
        private readonly string defaultInstallDir;
        private readonly string[] internationalApiSites;
        private readonly string[] domesticApiSites;

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
        private Panel pythonPage;
        private Panel directoryPage;
        private Panel apiPage;
        private Panel progressPage;
        private Panel finishPage;

        private Label pythonStatusLabel;
        private CheckBox pythonConsentCheckBox;
        private Label rStatusLabel;
        private CheckBox rConsentCheckBox;
        private Label nodeStatusLabel;
        private CheckBox nodeConsentCheckBox;
        private TextBox installDirTextBox;
        private Label progressStatusLabel;
        private ProgressBar installProgressBar;
        private CheckBox launchAfterInstallCheckBox;
        private Label finishLabel;

        private readonly List<Label> stepLabels;
        private readonly List<Panel> pages;
        private int currentPageIndex;
        private bool pythonDetected;
        private bool pythonInstalledByLmentor;
        private bool rDetected;
        private bool nodeDetected;
        private bool installCompleted;
        private string finalInstallDir;
        private string boundPythonHome;

        public InstallerForm()
        {
            this.logPath = Path.Combine(Path.GetTempPath(), "LmentorInstaller.log");
            this.tempRoot = Path.Combine(Path.GetTempPath(), "LmentorSetup-" + Guid.NewGuid().ToString("N"));
            this.defaultInstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Lmentor");
            this.internationalApiSites = new string[]
            {
                "LinkBus / 推荐国际模型入口：https://www.linkbus.net/register?aff=2Gn4",
                "灵石 / GPT 与 OpenAI：https://api.lingshi.chat/register?aff=GSNj",
                "本地中转站 / GPT 与 OpenAI：http://192.69.93.161:8080/register?aff=T2MN7K8VMFHR",
                "JuAPI / 国际模型入口：https://cdn.juaiapi.com/register?invite_code=qLUM"
            };
            this.domesticApiSites = new string[]
            {
                "七牛云：https://s.qiniu.com/jEBVVz",
                "AiOnly：https://maas.aiionly.com/login/6951720986",
                "硅基流动：https://cloud.siliconflow.cn/i/iaY91bIJ"
            };
            this.stepLabels = new List<Label>();
            this.pages = new List<Panel>();
            this.currentPageIndex = 0;
            this.pythonDetected = false;
            this.pythonInstalledByLmentor = false;
            this.rDetected = false;
            this.nodeDetected = false;
            this.installCompleted = false;
            this.finalInstallDir = string.Empty;
            this.boundPythonHome = string.Empty;

            WriteLog("Installer UI starting.");
            InitializeUi();
            DetectPython();
            UpdatePageState();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            base.OnFormClosed(e);
            try
            {
                if (Directory.Exists(this.tempRoot))
                {
                    Directory.Delete(this.tempRoot, true);
                }
            }
            catch
            {
            }
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
            using (Stream imageStream = InstallerResources.OpenResource(InstallerResources.BackgroundImage))
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
            heroDesc.Text = "本安装程序将以分步向导的方式，协助你完成运行环境准备、程序部署以及 API 获取说明。";
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
            this.titleLabel.Text = "欢迎安装 " + ProductDisplayName;
            this.titleLabel.Font = new Font("Microsoft YaHei UI", 20F, FontStyle.Bold, GraphicsUnit.Point);
            this.titleLabel.ForeColor = Color.FromArgb(36, 31, 28);
            this.titleLabel.AutoSize = false;
            this.titleLabel.Width = 620;
            this.titleLabel.Height = 44;
            this.titleLabel.Location = new Point(36, 28);

            this.subtitleLabel = new Label();
            this.subtitleLabel.Text = "安装向导将依次完成环境检查、目录选择、API 获取说明与程序部署。";
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
                "环境",
                "目录",
                "API",
                "安装",
                "完成"
            };

            for (int i = 0; i < stepNames.Length; i++)
            {
                Label label = new Label();
                label.Text = "  " + (i + 1).ToString() + " · " + stepNames[i] + "  ";
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
            this.pythonPage = CreatePagePanel();
            this.directoryPage = CreatePagePanel();
            this.apiPage = CreatePagePanel();
            this.progressPage = CreatePagePanel();
            this.finishPage = CreatePagePanel();

            BuildWelcomePage();
            BuildPythonPage();
            BuildDirectoryPage();
            BuildApiPage();
            BuildProgressPage();
            BuildFinishPage();

            this.pages.Add(this.welcomePage);
            this.pages.Add(this.pythonPage);
            this.pages.Add(this.directoryPage);
            this.pages.Add(this.apiPage);
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
            Label headline = CreateSectionTitle("安装开始前的说明");
            headline.Location = new Point(24, 22);

            Label body = CreateBodyLabel(
                "本安装程序采用图形化分步向导。你只需按页面提示逐步操作，即可完成 " + ProductDisplayName + " 的基础部署。\r\n\r\n" +
                "本次安装将依次执行以下步骤：\r\n" +
                "1. 检查并准备 Python 3.11 运行环境\r\n" +
                "2. 选择 " + ProductDisplayName + " 的安装目录\r\n" +
                "3. 说明 API 的获取方式与后续配置要求\r\n" +
                "4. 解压便携版主程序并创建桌面快捷方式\r\n\r\n" +
                "如需中止安装，可在任意阶段退出。本安装向导不会在未完成确认前将程序残留于系统目录中。");
            body.Location = new Point(24, 72);
            body.Size = new Size(560, 240);

            Panel tipCard = CreateCardPanel(24, 326, 560, 64);
            Label tip = new Label();
            tip.Text = "提示：" + ProductDisplayName + " 本身不附带 API Key。安装完成后，仍需由你自行前往相应网站注册并填写有效密钥。";
            tip.ForeColor = Color.FromArgb(90, 72, 54);
            tip.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold, GraphicsUnit.Point);
            tip.AutoSize = false;
            tip.Location = new Point(18, 16);
            tip.Size = new Size(520, 34);
            tipCard.Controls.Add(tip);

            this.welcomePage.Controls.Add(headline);
            this.welcomePage.Controls.Add(body);
            this.welcomePage.Controls.Add(tipCard);
        }

        private void BuildPythonPage()
        {
            Label headline = CreateSectionTitle("确认运行环境");
            headline.Location = new Point(24, 22);

            Label desc = CreateBodyLabel(
                ProductDisplayName + " 的运行依赖 Python 3.11、R 4.5.3 与 Node.js 22 或更高版本。\r\n\r\n" +
                "若当前设备缺少其中任一运行环境，本向导将在后续阶段启动安装包附带的对应安装程序或使用内置运行环境。完成外部安装界面后，向导会继续执行后续步骤。");
            desc.Location = new Point(24, 58);
            desc.Size = new Size(560, 54);

            Panel statusCard = CreateCardPanel(24, 120, 560, 56);
            this.pythonStatusLabel = new Label();
            this.pythonStatusLabel.AutoSize = false;
            this.pythonStatusLabel.Location = new Point(18, 8);
            this.pythonStatusLabel.Size = new Size(520, 38);
            this.pythonStatusLabel.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
            statusCard.Controls.Add(this.pythonStatusLabel);

            this.pythonConsentCheckBox = new CheckBox();
            this.pythonConsentCheckBox.Text = "如本机缺少 Python 3.11，我同意安装向导在后续步骤中启动随附的 Python 官方安装程序。";
            this.pythonConsentCheckBox.AutoSize = false;
            this.pythonConsentCheckBox.Location = new Point(24, 180);
            this.pythonConsentCheckBox.Size = new Size(560, 36);
            this.pythonConsentCheckBox.CheckedChanged += delegate { UpdatePageState(); };

            this.pythonPage.Controls.Add(headline);
            this.pythonPage.Controls.Add(desc);
            this.pythonPage.Controls.Add(statusCard);
            this.pythonPage.Controls.Add(this.pythonConsentCheckBox);

            Panel rCard = new Panel();
            rCard.Location = new Point(24, 218);
            rCard.Size = new Size(560, 58);
            rCard.BackColor = Color.FromArgb(238, 234, 225);
            this.rStatusLabel = new Label();
            this.rStatusLabel.AutoSize = false;
            this.rStatusLabel.Location = new Point(18, 8);
            this.rStatusLabel.Size = new Size(520, 42);
            this.rStatusLabel.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
            rCard.Controls.Add(this.rStatusLabel);
            this.rConsentCheckBox = new CheckBox();
            this.rConsentCheckBox.Text = "如本机缺少 R 4.5.3，我已知悉主程序仍可启动，但 R 分析功能需后续另行安装。";
            this.rConsentCheckBox.AutoSize = false;
            this.rConsentCheckBox.Location = new Point(24, 280);
            this.rConsentCheckBox.Size = new Size(560, 36);
            this.rConsentCheckBox.CheckedChanged += delegate { UpdatePageState(); };
            this.pythonPage.Controls.Add(rCard);
            this.pythonPage.Controls.Add(this.rConsentCheckBox);

            Panel nodeCard = new Panel();
            nodeCard.Location = new Point(24, 320);
            nodeCard.Size = new Size(560, 52);
            nodeCard.BackColor = Color.FromArgb(238, 234, 225);
            this.nodeStatusLabel = new Label();
            this.nodeStatusLabel.AutoSize = false;
            this.nodeStatusLabel.Location = new Point(18, 8);
            this.nodeStatusLabel.Size = new Size(520, 36);
            this.nodeStatusLabel.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
            nodeCard.Controls.Add(this.nodeStatusLabel);
            this.nodeConsentCheckBox = new CheckBox();
            this.nodeConsentCheckBox.Text = "如本机缺少 Node.js 22+，我同意安装向导启动随附的 Node.js 24 安装程序。";
            this.nodeConsentCheckBox.AutoSize = false;
            this.nodeConsentCheckBox.Location = new Point(24, 376);
            this.nodeConsentCheckBox.Size = new Size(560, 32);
            this.nodeConsentCheckBox.CheckedChanged += delegate { UpdatePageState(); };
            this.pythonPage.Controls.Add(nodeCard);
            this.pythonPage.Controls.Add(this.nodeConsentCheckBox);
        }

        private void BuildDirectoryPage()
        {
            Label headline = CreateSectionTitle("选择安装目录");
            headline.Location = new Point(24, 22);

            Label desc = CreateBodyLabel(
                "此处选择的是 " + ProductDisplayName + " 解压后的实际安装位置。安装向导会将主程序、CDXAgent 运行时以及默认配置文件一并部署至该目录。");
            desc.Location = new Point(24, 72);
            desc.Size = new Size(560, 72);

            Panel pathCard = CreateCardPanel(24, 164, 560, 120);

            this.installDirTextBox = new TextBox();
            this.installDirTextBox.Location = new Point(18, 26);
            this.installDirTextBox.Size = new Size(408, 30);
            this.installDirTextBox.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            this.installDirTextBox.Text = this.defaultInstallDir;
            this.installDirTextBox.TextChanged += delegate { UpdatePageState(); };

            Button browseButton = new Button();
            browseButton.Text = "浏览...";
            browseButton.Size = new Size(98, 30);
            browseButton.Location = new Point(438, 25);
            browseButton.FlatStyle = FlatStyle.Flat;
            browseButton.Click += delegate { BrowseInstallDirectory(); };

            Label hint = CreateMinorLabel("建议保留默认目录，以便后续维护、迁移与更新。");
            hint.Location = new Point(18, 70);
            hint.Size = new Size(500, 24);

            pathCard.Controls.Add(this.installDirTextBox);
            pathCard.Controls.Add(browseButton);
            pathCard.Controls.Add(hint);

            this.directoryPage.Controls.Add(headline);
            this.directoryPage.Controls.Add(desc);
            this.directoryPage.Controls.Add(pathCard);
        }

        private void BuildApiPage()
        {
            Label headline = CreateSectionTitle("安装前的 API 获取说明");
            headline.Location = new Point(24, 22);

            Label desc = CreateBodyLabel(
                ProductDisplayName + " 不会替用户生成 API Key，也不会自动代为注册账户。\r\n\r\n" +
                "以下网站是后续可前往获取 API 的入口。安装完成后，你需要自行完成注册、登录、充值或开通服务，并在 " + ProductDisplayName + " 的供应商管理页面中填写相应的 API Key。");
            desc.Location = new Point(24, 72);
            desc.Size = new Size(560, 108);

            GroupBox intlGroup = new GroupBox();
            intlGroup.Text = "国际模型入口";
            intlGroup.Location = new Point(24, 188);
            intlGroup.Size = new Size(560, 100);
            intlGroup.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
            AddApiButtons(intlGroup, this.internationalApiSites);

            GroupBox cnGroup = new GroupBox();
            cnGroup.Text = "国产聚合模型入口";
            cnGroup.Location = new Point(24, 300);
            cnGroup.Size = new Size(560, 112);
            cnGroup.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
            AddApiButtons(cnGroup, this.domesticApiSites);

            Panel confirmCard = CreateCardPanel(24, 426, 560, 72);
            Label confirmHint = new Label();
            confirmHint.Text = "继续下一步时，本向导将再次向你确认：你已知悉 API 需自行获取，并愿意在安装完成后前往相应网站完成配置。";
            confirmHint.ForeColor = Color.FromArgb(90, 72, 54);
            confirmHint.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            confirmHint.AutoSize = false;
            confirmHint.Location = new Point(18, 14);
            confirmHint.Size = new Size(520, 42);
            confirmCard.Controls.Add(confirmHint);

            this.apiPage.Controls.Add(headline);
            this.apiPage.Controls.Add(desc);
            this.apiPage.Controls.Add(intlGroup);
            this.apiPage.Controls.Add(cnGroup);
            this.apiPage.Controls.Add(confirmCard);
        }

        private void BuildProgressPage()
        {
            Label headline = CreateSectionTitle("正在执行安装，请稍候");
            headline.Location = new Point(24, 22);

            this.progressStatusLabel = CreateBodyLabel("安装程序正在准备部署文件。");
            this.progressStatusLabel.Location = new Point(24, 88);
            this.progressStatusLabel.Size = new Size(560, 80);
            this.progressStatusLabel.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Regular, GraphicsUnit.Point);

            this.installProgressBar = new ProgressBar();
            this.installProgressBar.Location = new Point(24, 188);
            this.installProgressBar.Size = new Size(560, 28);
            this.installProgressBar.Minimum = 0;
            this.installProgressBar.Maximum = 100;
            this.installProgressBar.Value = 0;

            Panel noteCard = CreateCardPanel(24, 246, 560, 100);
            Label note = CreateBodyLabel("如安装过程中需要启动 Python 官方安装界面，请先在该界面中完成确认或安装。结束后，本向导将自动继续执行。");
            note.Location = new Point(18, 16);
            note.Size = new Size(520, 60);
            noteCard.Controls.Add(note);

            this.progressPage.Controls.Add(headline);
            this.progressPage.Controls.Add(this.progressStatusLabel);
            this.progressPage.Controls.Add(this.installProgressBar);
            this.progressPage.Controls.Add(noteCard);
        }

        private void BuildFinishPage()
        {
            Label headline = CreateSectionTitle(ProductDisplayName + " 已安装完成");
            headline.Location = new Point(24, 22);

            this.finishLabel = CreateBodyLabel("程序已部署至目标目录，桌面快捷方式也已创建。");
            this.finishLabel.Location = new Point(24, 88);
            this.finishLabel.Size = new Size(560, 120);

            this.launchAfterInstallCheckBox = new CheckBox();
            this.launchAfterInstallCheckBox.Text = "安装完成后立即启动 " + ProductDisplayName;
            this.launchAfterInstallCheckBox.Checked = true;
            this.launchAfterInstallCheckBox.Location = new Point(24, 230);
            this.launchAfterInstallCheckBox.Size = new Size(320, 28);

            Panel noteCard = CreateCardPanel(24, 282, 560, 92);
            Label note = CreateBodyLabel("建议在首次启动后，优先进入“管理 → 供应商管理”填写你自己的 API Key，再继续后续使用。");
            note.Location = new Point(18, 18);
            note.Size = new Size(520, 48);
            noteCard.Controls.Add(note);

            this.finishPage.Controls.Add(headline);
            this.finishPage.Controls.Add(this.finishLabel);
            this.finishPage.Controls.Add(this.launchAfterInstallCheckBox);
            this.finishPage.Controls.Add(noteCard);
        }

        private Label CreateSectionTitle(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = new Font("Microsoft YaHei UI", 14F, FontStyle.Bold, GraphicsUnit.Point);
            label.ForeColor = Color.FromArgb(41, 34, 29);
            label.AutoSize = false;
            label.Size = new Size(560, 36);
            return label;
        }

        private Label CreateBodyLabel(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            label.ForeColor = Color.FromArgb(82, 74, 66);
            label.AutoSize = false;
            label.MaximumSize = new Size(560, 0);
            return label;
        }

        private Label CreateMinorLabel(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            label.ForeColor = Color.FromArgb(116, 106, 98);
            label.AutoSize = false;
            return label;
        }

        private Panel CreateCardPanel(int x, int y, int width, int height)
        {
            Panel panel = new Panel();
            panel.Location = new Point(x, y);
            panel.Size = new Size(width, height);
            panel.BackColor = Color.FromArgb(246, 238, 228);
            panel.BorderStyle = BorderStyle.FixedSingle;
            return panel;
        }

        private void AddApiButtons(GroupBox groupBox, string[] items)
        {
            for (int i = 0; i < items.Length; i++)
            {
                string entry = items[i];
                string[] parts = entry.Split(new string[] { "：" }, 2, StringSplitOptions.None);
                string labelText = parts.Length > 0 ? parts[0] : entry;
                string url = parts.Length > 1 ? parts[1] : string.Empty;

                Label label = new Label();
                label.Text = labelText;
                label.Location = new Point(16, 28 + (i * 24));
                label.Size = new Size(220, 22);
                label.ForeColor = Color.FromArgb(74, 62, 52);
                label.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

                LinkLabel link = new LinkLabel();
                link.Text = url;
                link.Location = new Point(222, 28 + (i * 24));
                link.Size = new Size(320, 22);
                link.LinkColor = Color.FromArgb(72, 116, 181);
                link.ActiveLinkColor = Color.FromArgb(117, 82, 182);
                link.VisitedLinkColor = Color.FromArgb(72, 116, 181);
                link.Tag = url;
                link.Click += delegate(object sender, EventArgs args)
                {
                    LinkLabel clicked = sender as LinkLabel;
                    if (clicked != null && clicked.Tag is string)
                    {
                        OpenUrl((string)clicked.Tag);
                    }
                };

                groupBox.Controls.Add(label);
                groupBox.Controls.Add(link);
            }
        }

        private void OpenUrl(string url)
        {
            try
            {
                Process.Start(url);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "无法打开以下链接：\r\n" + url + "\r\n\r\n" + ex.Message, InstallerDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void DetectPython()
        {
            this.pythonDetected = HasUsablePython();
            this.rDetected = HasUsableR();
            this.nodeDetected = HasUsableNode();
            if (this.pythonDetected)
            {
                this.pythonStatusLabel.Text = "已检测到本机存在可用的 Python 3.11，无需额外安装，下一步可直接继续。";
                this.pythonStatusLabel.ForeColor = Color.FromArgb(34, 115, 70);
                this.pythonConsentCheckBox.Checked = true;
                this.pythonConsentCheckBox.Enabled = false;
            }
            else
            {
                this.pythonStatusLabel.Text = "当前未检测到可直接使用的 Python 3.11。安装过程中将先启动随附的 Python 安装程序。";
                this.pythonStatusLabel.ForeColor = Color.FromArgb(163, 93, 36);
                this.pythonConsentCheckBox.Checked = false;
                this.pythonConsentCheckBox.Enabled = true;
            }
            if (this.rDetected)
            {
                this.rStatusLabel.Text = "已检测到 R 4.5.3，可直接继续。";
                this.rStatusLabel.ForeColor = Color.FromArgb(34, 115, 70);
                this.rConsentCheckBox.Checked = true;
                this.rConsentCheckBox.Enabled = false;
            }
            else
            {
                this.rStatusLabel.Text = "未检测到 R 4.5.3。主程序可以继续安装，R 分析功能需后续另行配置。";
                this.rStatusLabel.ForeColor = Color.FromArgb(163, 93, 36);
                this.rConsentCheckBox.Checked = true;
                this.rConsentCheckBox.Enabled = true;
            }
            if (this.nodeDetected)
            {
                this.nodeStatusLabel.Text = "已检测到 Node.js 22 或更高版本，无需额外安装。";
                this.nodeStatusLabel.ForeColor = Color.FromArgb(34, 115, 70);
                this.nodeConsentCheckBox.Checked = true;
                this.nodeConsentCheckBox.Enabled = false;
            }
            else
            {
                this.nodeStatusLabel.Text = "当前未检测到 Node.js 22+。安装过程中将启动随附的 Node.js 24 安装程序。";
                this.nodeStatusLabel.ForeColor = Color.FromArgb(163, 93, 36);
                this.nodeConsentCheckBox.Checked = true;
                this.nodeConsentCheckBox.Enabled = true;
            }
        }

        private bool HasUsableNode()
        {
            return !string.IsNullOrWhiteSpace(FindUsableNodeExecutable());
        }

        private string FindUsableNodeExecutable()
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe"),
                "node.exe"
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                string candidate = candidates[i];
                if (!string.Equals(candidate, "node.exe", StringComparison.OrdinalIgnoreCase) && !File.Exists(candidate))
                {
                    continue;
                }

                try
                {
                    ProcessStartInfo probe = new ProcessStartInfo();
                    probe.FileName = candidate;
                    probe.Arguments = "--version";
                    probe.UseShellExecute = false;
                    probe.CreateNoWindow = true;
                    probe.RedirectStandardOutput = true;
                    using (Process process = Process.Start(probe))
                    {
                        if (process == null)
                        {
                            continue;
                        }

                        string version = process.StandardOutput.ReadToEnd().Trim().TrimStart('v', 'V');
                        process.WaitForExit();
                        string[] versionParts = version.Split('.');
                        int major;
                        if (process.ExitCode == 0 && versionParts.Length > 0 && int.TryParse(versionParts[0], out major) && major >= 22)
                        {
                            return candidate;
                        }
                    }
                }
                catch
                {
                }
            }

            return string.Empty;
        }

        private bool HasUsableR()
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetEnvironmentVariable("R_HOME") ?? string.Empty, "bin", "Rscript.exe"),
                "C:\\Program Files\\R\\R-4.5.3\\bin\\Rscript.exe",
                "Rscript.exe"
            };
            for (int i = 0; i < candidates.Length; i++)
            {
                try
                {
                    if (candidates[i].Equals("Rscript.exe", StringComparison.OrdinalIgnoreCase) || File.Exists(candidates[i]))
                    {
                        ProcessStartInfo check = new ProcessStartInfo(candidates[i], "--version");
                        check.UseShellExecute = false;
                        check.CreateNoWindow = true;
                        using (Process process = Process.Start(check))
                        {
                            if (process != null)
                            {
                                process.WaitForExit();
                                if (process.ExitCode == 0) return true;
                            }
                        }
                    }
                }
                catch { }
            }
            return false;
        }

        private bool HasUsablePython()
        {
            return !string.IsNullOrWhiteSpace(FindUsablePythonHome());
        }

        private string FindUsablePythonHome()
        {
            string[] commands = new string[]
            {
                "py|-3.11 -c \"import sys; print(sys.base_prefix); raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)\"",
                "python|-c \"import sys; print(sys.base_prefix); raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)\""
            };

            for (int i = 0; i < commands.Length; i++)
            {
                string[] parts = commands[i].Split(new char[] { '|' }, 2);
                try
                {
                    ProcessStartInfo probe = new ProcessStartInfo();
                    probe.FileName = parts[0];
                    probe.Arguments = parts[1];
                    probe.UseShellExecute = false;
                    probe.CreateNoWindow = true;
                    probe.RedirectStandardOutput = true;
                    using (Process process = Process.Start(probe))
                    {
                        if (process == null)
                        {
                            continue;
                        }

                        string pythonHome = process.StandardOutput.ReadToEnd().Trim();
                        process.WaitForExit();
                        if (process.ExitCode == 0 && File.Exists(Path.Combine(pythonHome, "python.exe")))
                        {
                            return pythonHome;
                        }
                    }
                }
                catch
                {
                }
            }

            return string.Empty;
        }

        private void BrowseInstallDirectory()
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "请选择 " + ProductDisplayName + " 的安装目录";
                dialog.SelectedPath = string.IsNullOrWhiteSpace(this.installDirTextBox.Text) ? this.defaultInstallDir : this.installDirTextBox.Text;
                dialog.ShowNewFolderButton = true;
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    this.installDirTextBox.Text = dialog.SelectedPath;
                }
            }
        }

        private void MovePrevious()
        {
            if (this.currentPageIndex <= 0 || this.installCompleted)
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

            if (this.currentPageIndex == 3)
            {
                this.currentPageIndex = 4;
                UpdatePageState();
                BeginInstall();
                return;
            }

            this.currentPageIndex++;
            UpdatePageState();
        }

        private bool ValidateCurrentPage()
        {
            if (this.currentPageIndex == 1)
            {
                if (!this.pythonDetected && !this.pythonConsentCheckBox.Checked)
                {
                    MessageBox.Show(this, "如本机缺少 Python 3.11，请先确认允许安装向导启动随附的 Python 安装程序。", InstallerDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return false;
                }
                if (!this.rDetected && !this.rConsentCheckBox.Checked)
                {
                    MessageBox.Show(this, "如本机缺少 R 4.5.3，请先确认已知悉 R 分析功能需要后续另行安装。", InstallerDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return false;
                }
                if (!this.nodeDetected && !this.nodeConsentCheckBox.Checked)
                {
                    MessageBox.Show(this, "如本机缺少 Node.js 22+，请先确认允许安装向导启动随附的 Node.js 24 安装程序。", InstallerDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return false;
                }
            }

            if (this.currentPageIndex == 2)
            {
                string installDir = this.installDirTextBox.Text == null ? string.Empty : this.installDirTextBox.Text.Trim();
                if (installDir.Length == 0)
                {
                    MessageBox.Show(this, "请先选择安装目录。", InstallerDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return false;
                }

                string fullPath = Path.GetFullPath(installDir);
                string rootPath = Path.GetPathRoot(fullPath);
                string normalizedFullPath = fullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string normalizedRootPath = rootPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                if (string.Equals(normalizedFullPath, normalizedRootPath, StringComparison.OrdinalIgnoreCase))
                {
                    MessageBox.Show(this, "不能直接安装到磁盘根目录。", InstallerDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return false;
                }
            }

            if (this.currentPageIndex == 3)
            {
                DialogResult confirm = MessageBox.Show(
                    this,
                    "请再次确认：\r\n\r\n你已知悉 API 需由你自行前往相关网站获取，并将在安装完成后自行完成后续配置。\r\n\r\n是否继续安装？",
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

            this.backButton.Enabled = this.currentPageIndex > 0 && this.currentPageIndex < 4 && !this.installCompleted;
            this.cancelButton.Enabled = !this.installCompleted;

            if (this.currentPageIndex == 0)
            {
                this.nextButton.Text = "继续";
            }
            else if (this.currentPageIndex == 3)
            {
                this.nextButton.Text = "开始安装";
            }
            else if (this.currentPageIndex == 5)
            {
                this.nextButton.Text = "完成";
            }
            else
            {
                this.nextButton.Text = "下一步";
            }

            this.nextButton.Enabled = this.currentPageIndex < 4 || (this.currentPageIndex == 5 && this.installCompleted);
        }

        private void BeginInstall()
        {
            this.backButton.Enabled = false;
            this.cancelButton.Enabled = false;
            this.nextButton.Enabled = false;
            SetProgress(0, "正在准备安装。");

            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    RunInstallSequence();
                    this.Invoke((MethodInvoker)delegate
                    {
                        this.installCompleted = true;
                        this.currentPageIndex = 5;
                        this.finishLabel.Text =
                            ProductDisplayName + " 已成功安装至以下目录：\r\n" + this.finalInstallDir + "\r\n\r\n" +
                            "桌面快捷方式已经创建。后续可直接启动程序，并按页面提示继续完成 API 配置。";
                        UpdatePageState();
                    });
                }
                catch (Exception ex)
                {
                    WriteLog("INSTALL FAILED: " + ex);
                    this.Invoke((MethodInvoker)delegate
                    {
                        MessageBox.Show(this, "安装过程中发生错误：\r\n\r\n" + ex.Message, InstallerDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                        this.currentPageIndex = 3;
                        this.installCompleted = false;
                        UpdatePageState();
                    });
                }
            });
        }

        private void RunInstallSequence()
        {
            WriteLog("INSTALL START");

            string installDir = this.installDirTextBox.Text == null ? string.Empty : this.installDirTextBox.Text.Trim();
            installDir = Path.GetFullPath(installDir);
            this.finalInstallDir = installDir;

            if (!this.nodeDetected)
            {
                SetProgress(6, "正在释放并启动 Node.js 24 安装程序。");
                string nodePath = Path.Combine(this.tempRoot, "node-v24.18.1-x64.msi");
                InstallerResources.ExtractResourceToFile(InstallerResources.NodeInstaller, nodePath);
                RunInteractiveProcess("msiexec.exe", "/i \"" + nodePath + "\"", true);
                this.nodeDetected = HasUsableNode();
                if (!this.nodeDetected)
                {
                    throw new InvalidOperationException("Node.js 安装流程结束后，仍未检测到可用的 Node.js 22+，安装已中止。");
                }
            }

            if (!this.pythonDetected)
            {
                SetProgress(14, "正在释放并启动 Python 3.11 安装程序。");
                string pythonPath = Path.Combine(this.tempRoot, "python-3.11.9-amd64_2.exe");
                InstallerResources.ExtractResourceToFile(InstallerResources.PythonInstaller, pythonPath);
                // Keep the launcher available to this app even when the user
                // chooses the default per-user Python installation options.
                RunInteractiveProcess(pythonPath, "PrependPath=1 Include_launcher=1", true);
                this.pythonDetected = HasUsablePython();
                if (!this.pythonDetected)
                {
                    throw new InvalidOperationException("Python 安装流程结束后，仍未检测到可用的 Python 3.11，安装已中止。");
                }
                this.pythonInstalledByLmentor = true;
            }
            this.boundPythonHome = FindUsablePythonHome();
            if (string.IsNullOrWhiteSpace(this.boundPythonHome))
            {
                throw new InvalidOperationException("无法定位本次安装将绑定的 Python 3.11 运行目录。");
            }

            SetProgress(26, "正在准备安装目录。");
            if (Directory.Exists(installDir))
            {
                string[] existingItems = Directory.GetFileSystemEntries(installDir);
                if (existingItems.Length > 0)
                {
                    DialogResult overwrite = DialogResult.None;
                    this.Invoke((MethodInvoker)delegate
                    {
                        overwrite = MessageBox.Show(
                            this,
                            "目标目录中已经存在文件：\r\n\r\n" + installDir + "\r\n\r\n继续安装将覆盖该目录中的现有内容。是否继续？",
                            InstallerDisplayName,
                            MessageBoxButtons.YesNo,
                            MessageBoxIcon.Warning);
                    });
                    if (overwrite != DialogResult.Yes)
                    {
                        throw new OperationCanceledException("用户取消了对既有安装目录的覆盖操作。");
                    }

                    ClearDirectory(installDir);
                }
            }
            Directory.CreateDirectory(installDir);

            SetProgress(38, "正在释放 " + ProductDisplayName + " 主程序文件。");
            string payloadPath = Path.Combine(this.tempRoot, "Lmentor-payload.zip");
            InstallerResources.ExtractResourceToFile(InstallerResources.PayloadZip, payloadPath);
            ExtractZipWithProgress(payloadPath, installDir, 38, 45, "正在释放主程序文件：");

            string environmentArchivePath = Path.Combine(installDir, InstallerResources.EnvironmentArchiveFileName);
            if (File.Exists(environmentArchivePath))
            {
                SetProgress(45, "正在展开隔离 Python、R 与扩展包环境。");
                ExtractZipWithProgress(environmentArchivePath, installDir, 45, 88, "正在展开环境文件：");
                File.Delete(environmentArchivePath);
                RebaseInstalledPythonEnvironment(installDir);
            }
            else
            {
                SetProgress(88, "未附带扩展环境归档，将使用本机已安装的运行环境。");
                WriteLog("Optional environment archive is not included.");
            }
            WriteRuntimeOwnership(installDir);

            if (!this.rDetected)
            {
                string bundledRscript = Path.Combine(installDir, "runtime", "R-4.5.3", "bin", "Rscript.exe");
                if (File.Exists(bundledRscript))
                {
                    this.rDetected = true;
                }
                else
                {
                    WriteLog("R 4.5.3 is not available; R-dependent features remain optional.");
                }
            }

            SetProgress(92, "正在创建桌面快捷方式。");
            CreateDesktopShortcut(installDir);

            SetProgress(100, "安装已经完成。");
            WriteLog("INSTALL COMPLETE");
        }

        private void WriteRuntimeOwnership(string installDir)
        {
            string markerPath = Path.Combine(installDir, ".lmentor-runtime-ownership.txt");
            string marker =
                "python_installed_by_lmentor=" + (this.pythonInstalledByLmentor ? "true" : "false") + Environment.NewLine +
                "python_home=" + this.boundPythonHome + Environment.NewLine;
            File.WriteAllText(markerPath, marker, new System.Text.UTF8Encoding(false));
            WriteLog("Wrote Python runtime ownership marker. Owned=" + this.pythonInstalledByLmentor.ToString());
        }

        private void RebaseInstalledPythonEnvironment(string installDir)
        {
            string venvPath = Path.Combine(installDir, ".venv");
            string configPath = Path.Combine(venvPath, "pyvenv.cfg");
            string installedPython = Path.Combine(this.boundPythonHome, "python.exe");

            if (!File.Exists(installedPython) || !File.Exists(configPath))
            {
                throw new InvalidOperationException("Python 3.11 runtime binding is incomplete.");
            }

            string config =
                "home = " + this.boundPythonHome + Environment.NewLine +
                "implementation = CPython" + Environment.NewLine +
                "version = 3.11.9" + Environment.NewLine +
                "executable = " + installedPython + Environment.NewLine +
                "command = " + installedPython + " -m venv " + venvPath + Environment.NewLine +
                "include-system-site-packages = false" + Environment.NewLine +
                "base-prefix = " + this.boundPythonHome + Environment.NewLine +
                "base-exec-prefix = " + this.boundPythonHome + Environment.NewLine +
                "base-executable = " + installedPython + Environment.NewLine;

            File.WriteAllText(configPath, config, new System.Text.UTF8Encoding(false));
            WriteLog("Rebased Python 3.11 venv to " + this.boundPythonHome);
        }

        private void RunInteractiveProcess(string fileName, string arguments, bool waitForExit)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = fileName;
            startInfo.Arguments = arguments;
            startInfo.UseShellExecute = true;
            startInfo.WorkingDirectory = Path.GetDirectoryName(fileName);

            using (Process process = Process.Start(startInfo))
            {
                if (process == null)
                {
                    throw new InvalidOperationException("无法启动以下程序：" + fileName);
                }

                if (waitForExit)
                {
                    process.WaitForExit();
                    if (process.ExitCode != 0 && process.ExitCode != 1641 && process.ExitCode != 3010)
                    {
                        throw new InvalidOperationException("外部安装程序未成功完成，退出代码：" + process.ExitCode);
                    }
                }
            }
        }

        private void ExtractZipWithProgress(
            string zipPath,
            string installDir,
            int progressStart,
            int progressEnd,
            string statusPrefix)
        {
            using (FileStream stream = new FileStream(zipPath, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                int total = archive.Entries.Count;
                int index = 0;

                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string targetPath = Path.Combine(installDir, entry.FullName);
                    string targetDirectory = Path.GetDirectoryName(targetPath);
                    if (!string.IsNullOrEmpty(targetDirectory))
                    {
                        Directory.CreateDirectory(targetDirectory);
                    }

                    if (!string.IsNullOrEmpty(entry.Name))
                    {
                        entry.ExtractToFile(targetPath, true);
                    }

                    index++;
                    int value = progressStart + (int)((index / (double)Math.Max(total, 1)) * (progressEnd - progressStart));
                    SetProgress(value, statusPrefix + entry.FullName);
                }
            }
        }

        private void ClearDirectory(string path)
        {
            string[] entries = Directory.GetFileSystemEntries(path);
            for (int i = 0; i < entries.Length; i++)
            {
                string entry = entries[i];
                if (Directory.Exists(entry))
                {
                    Directory.Delete(entry, true);
                }
                else if (File.Exists(entry))
                {
                    File.Delete(entry);
                }
            }
        }

        private void CreateDesktopShortcut(string installDir)
        {
            string appPath = Path.Combine(installDir, "Lmentor.exe");
            string[] versionedIcons = Directory.GetFiles(installDir, "app-icon-*.ico");
            Array.Sort(versionedIcons, StringComparer.OrdinalIgnoreCase);
            string iconPath = versionedIcons.Length > 0
                ? versionedIcons[versionedIcons.Length - 1]
                : Path.Combine(installDir, "app-icon.ico");
            string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string shortcutPath = Path.Combine(desktopPath, ProductDisplayName + ".lnk");

            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null)
            {
                throw new InvalidOperationException("无法创建桌面快捷方式：未找到 WScript.Shell。");
            }

            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
            shortcut.GetType().InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { appPath });
            shortcut.GetType().InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { installDir });
            shortcut.GetType().InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { ProductDisplayName });
            shortcut.GetType().InvokeMember(
                "IconLocation",
                BindingFlags.SetProperty,
                null,
                shortcut,
                new object[] { File.Exists(iconPath) ? iconPath + ",0" : appPath });
            shortcut.GetType().InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }

        private void SetProgress(int value, string message)
        {
            if (this.InvokeRequired)
            {
                this.Invoke((MethodInvoker)delegate { SetProgress(value, message); });
                return;
            }

            if (value < this.installProgressBar.Minimum)
            {
                value = this.installProgressBar.Minimum;
            }
            if (value > this.installProgressBar.Maximum)
            {
                value = this.installProgressBar.Maximum;
            }

            this.installProgressBar.Value = value;
            this.progressStatusLabel.Text = message;
            this.progressPage.Refresh();
            WriteLog("PROGRESS " + value.ToString() + ": " + message);
        }

        private void FinishAndClose()
        {
            try
            {
                if (this.launchAfterInstallCheckBox.Checked && !string.IsNullOrEmpty(this.finalInstallDir))
                {
                    string appPath = Path.Combine(this.finalInstallDir, "Lmentor.exe");
                    if (File.Exists(appPath))
                    {
                        Process.Start(appPath);
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "安装已完成，但自动启动失败：\r\n\r\n" + ex.Message, InstallerDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }

            this.Close();
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

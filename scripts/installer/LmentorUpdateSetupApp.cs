using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace LmentorUpdateInstaller
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            if (args != null && args.Length == 1 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    UpdatePackage.Load().ValidatePackage();
                    Environment.Exit(0);
                }
                catch
                {
                    Environment.Exit(1);
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new UpdateForm());
        }
    }

    internal sealed class UpdateEntry
    {
        public string relativePath { get; set; }
        public string sha256 { get; set; }
        public string baselineSha256 { get; set; }
        public long length { get; set; }
    }

    internal sealed class UpdateManifest
    {
        public string product { get; set; }
        public string version { get; set; }
        public string baselineVersion { get; set; }
        public List<string> releaseNotes { get; set; }
        public List<UpdateEntry> files { get; set; }
    }

    internal sealed class FilePlan
    {
        public UpdateEntry Entry;
        public string InstalledHash;
        public string Status;
        public bool RequiresReplacement;
    }

    internal sealed class UpdateAssessment
    {
        public string InstallRoot;
        public string InstalledVersion;
        public string CompatibilityMessage;
        public bool CanUpdate;
        public bool AlreadyCurrent;
        public long RequiredBytes;
        public List<FilePlan> Files;
    }

    internal sealed class UpdatePackage
    {
        private const string ArchiveResource = "Lmentor.UpdateArchive";
        private const string ImageResource = "Lmentor.BackgroundImage";

        public UpdateManifest Manifest { get; private set; }
        public string PackageRoot { get; private set; }
        public string PayloadRoot { get { return Path.Combine(PackageRoot, "payload", "files"); } }

        private UpdatePackage() { }

        public static UpdatePackage Load()
        {
            string root = Path.Combine(Path.GetTempPath(), "ShiMen-Update-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ArchiveResource))
            {
                if (stream == null) throw new InvalidOperationException("升级安装器资源不完整。");
                using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read, false))
                {
                    archive.ExtractToDirectory(root);
                }
            }

            string manifestPath = Path.Combine(root, "update-manifest.json");
            if (!File.Exists(manifestPath)) throw new InvalidOperationException("升级清单不存在。");
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            UpdateManifest manifest = serializer.Deserialize<UpdateManifest>(File.ReadAllText(manifestPath, Encoding.UTF8));
            if (manifest == null || string.IsNullOrWhiteSpace(manifest.version) || manifest.files == null || manifest.files.Count == 0)
            {
                throw new InvalidOperationException("升级清单无效。");
            }

            UpdatePackage package = new UpdatePackage();
            package.Manifest = manifest;
            package.PackageRoot = root;
            package.ValidatePackage();
            return package;
        }

        public static Image LoadBackground()
        {
            Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ImageResource);
            return stream == null ? null : Image.FromStream(stream);
        }

        public void ValidatePackage()
        {
            foreach (UpdateEntry entry in Manifest.files)
            {
                if (entry == null || string.IsNullOrWhiteSpace(entry.relativePath) || string.IsNullOrWhiteSpace(entry.sha256))
                {
                    throw new InvalidOperationException("升级清单包含无效文件项。");
                }
                string payloadPath = SafeCombine(PayloadRoot, entry.relativePath);
                if (!File.Exists(payloadPath) || !string.Equals(GetSha256(payloadPath), entry.sha256, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("升级文件完整性验证失败：" + entry.relativePath);
                }
            }
        }

        public static string SafeCombine(string root, string relativePath)
        {
            string fullRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string fullPath = Path.GetFullPath(Path.Combine(root, relativePath.Replace('/', Path.DirectorySeparatorChar)));
            if (!fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("升级清单路径非法。");
            return fullPath;
        }

        public static string GetSha256(string path)
        {
            using (SHA256 sha = SHA256.Create())
            using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }
    }

    internal sealed class UpdateForm : Form
    {
        private readonly UpdatePackage package;
        private readonly string tempRoot;
        private TextBox exePathBox;
        private Label versionLabel;
        private Label compatibilityLabel;
        private Label summaryLabel;
        private ListView fileList;
        private Button browseButton;
        private Button refreshButton;
        private Button updateButton;
        private ProgressBar progress;
        private Label progressLabel;
        private UpdateAssessment assessment;

        public UpdateForm()
        {
            package = UpdatePackage.Load();
            tempRoot = package.PackageRoot;
            InitializeUi();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            base.OnFormClosed(e);
            try { if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true); } catch { }
        }

        private void InitializeUi()
        {
            Text = "师门 " + package.Manifest.version + " 升级安装程序";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(980, 650);
            MinimumSize = new Size(900, 580);
            Font = new Font("Microsoft YaHei UI", 9F);
            BackColor = Color.FromArgb(247, 245, 240);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;

            Panel visualPanel = new Panel { Dock = DockStyle.Left, Width = 292, BackColor = Color.FromArgb(30, 27, 24) };
            Image background = UpdatePackage.LoadBackground();
            if (background != null)
            {
                PictureBox box = new PictureBox { Dock = DockStyle.Fill, Image = background, SizeMode = PictureBoxSizeMode.Zoom };
                visualPanel.Controls.Add(box);
            }
            Panel overlay = new Panel { Dock = DockStyle.Bottom, Height = 196, BackColor = Color.FromArgb(205, 20, 18, 17) };
            Label product = new Label { Text = "师门", ForeColor = Color.White, Font = new Font("Microsoft YaHei UI", 25F, FontStyle.Bold), AutoSize = false, Location = new Point(24, 24), Size = new Size(240, 50) };
            Label release = new Label { Text = package.Manifest.version + " 增量升级", ForeColor = Color.FromArgb(236, 231, 222), Font = new Font("Microsoft YaHei UI", 12F), AutoSize = false, Location = new Point(27, 78), Size = new Size(220, 30) };
            Label note = new Label { Text = "仅替换经过校验的程序文件。\r\n会话、技能、配置与项目数据均会保留。", ForeColor = Color.FromArgb(235, 235, 235), Font = new Font("Microsoft YaHei UI", 9.5F), AutoSize = false, Location = new Point(27, 116), Size = new Size(240, 56) };
            overlay.Controls.Add(product); overlay.Controls.Add(release); overlay.Controls.Add(note); visualPanel.Controls.Add(overlay);

            Panel content = new Panel { Dock = DockStyle.Fill, Padding = new Padding(32, 25, 32, 22), BackColor = Color.FromArgb(250, 248, 244) };
            Label title = new Label { Text = "选择现有师门程序", Font = new Font("Microsoft YaHei UI", 20F, FontStyle.Bold), ForeColor = Color.FromArgb(45, 39, 34), AutoSize = false, Location = new Point(32, 24), Size = new Size(600, 42) };
            Label subtitle = new Label { Text = "请选择现有安装目录内的 Lmentor.exe。升级器将识别版本、校验兼容性并列出需要替换的文件。", Font = new Font("Microsoft YaHei UI", 10F), ForeColor = Color.FromArgb(105, 94, 84), AutoSize = false, Location = new Point(34, 68), Size = new Size(620, 36) };
            content.Controls.Add(title); content.Controls.Add(subtitle);

            exePathBox = new TextBox { Location = new Point(34, 117), Size = new Size(490, 30), ReadOnly = true, BackColor = Color.White, BorderStyle = BorderStyle.FixedSingle };
            browseButton = new Button { Text = "选择 Lmentor.exe", Location = new Point(536, 115), Size = new Size(130, 32), FlatStyle = FlatStyle.Flat, BackColor = Color.White };
            browseButton.FlatAppearance.BorderColor = Color.FromArgb(145, 124, 104);
            browseButton.Click += delegate { ChooseExecutable(); };
            content.Controls.Add(exePathBox); content.Controls.Add(browseButton);

            Panel info = new Panel { Location = new Point(34, 164), Size = new Size(632, 100), BackColor = Color.FromArgb(238, 233, 225), BorderStyle = BorderStyle.FixedSingle };
            versionLabel = CreateInfoLabel("尚未选择师门程序。", 16, 13, 600, true);
            compatibilityLabel = CreateInfoLabel("选择后将自动检测可否从 1.0.0 升级。", 16, 41, 600, false);
            summaryLabel = CreateInfoLabel("", 16, 68, 600, false);
            info.Controls.Add(versionLabel); info.Controls.Add(compatibilityLabel); info.Controls.Add(summaryLabel); content.Controls.Add(info);

            Label listTitle = new Label { Text = "升级项目", Font = new Font("Microsoft YaHei UI", 11F, FontStyle.Bold), ForeColor = Color.FromArgb(55, 48, 43), AutoSize = true, Location = new Point(34, 282) };
            content.Controls.Add(listTitle);
            fileList = new ListView { Location = new Point(34, 310), Size = new Size(632, 185), View = View.Details, FullRowSelect = true, GridLines = true, HeaderStyle = ColumnHeaderStyle.Nonclickable, BackColor = Color.White };
            fileList.Columns.Add("文件", 315); fileList.Columns.Add("当前状态", 200); fileList.Columns.Add("大小", 95);
            content.Controls.Add(fileList);

            progress = new ProgressBar { Location = new Point(34, 521), Size = new Size(632, 20), Style = ProgressBarStyle.Continuous, Visible = false };
            progressLabel = new Label { Location = new Point(34, 545), Size = new Size(632, 24), ForeColor = Color.FromArgb(91, 79, 68), Visible = false };
            content.Controls.Add(progress); content.Controls.Add(progressLabel);

            refreshButton = new Button { Text = "重新检测", Location = new Point(414, 580), Size = new Size(112, 35), FlatStyle = FlatStyle.Flat, BackColor = Color.White, Enabled = false };
            refreshButton.Click += delegate { AssessSelection(); };
            updateButton = new Button { Text = "开始升级", Location = new Point(538, 580), Size = new Size(128, 35), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(105, 78, 58), ForeColor = Color.White, Enabled = false };
            updateButton.FlatAppearance.BorderSize = 0;
            updateButton.Click += delegate { StartUpdate(); };
            content.Controls.Add(refreshButton); content.Controls.Add(updateButton);

            Controls.Add(content); Controls.Add(visualPanel);
        }

        private static Label CreateInfoLabel(string text, int x, int y, int width, bool bold)
        {
            return new Label { Text = text, Location = new Point(x, y), Size = new Size(width, 22), AutoSize = false, Font = new Font("Microsoft YaHei UI", 9.5F, bold ? FontStyle.Bold : FontStyle.Regular), ForeColor = Color.FromArgb(65, 56, 48) };
        }

        private void ChooseExecutable()
        {
            using (OpenFileDialog dialog = new OpenFileDialog())
            {
                dialog.Title = "选择师门安装目录中的 Lmentor.exe";
                dialog.Filter = "师门启动程序 (Lmentor.exe)|Lmentor.exe|可执行文件 (*.exe)|*.exe";
                dialog.CheckFileExists = true;
                dialog.Multiselect = false;
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                if (!string.Equals(Path.GetFileName(dialog.FileName), "Lmentor.exe", StringComparison.OrdinalIgnoreCase))
                {
                    MessageBox.Show(this, "请选择师门安装目录中的 Lmentor.exe。", "文件不正确", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                exePathBox.Text = dialog.FileName;
                AssessSelection();
            }
        }

        private void AssessSelection()
        {
            fileList.Items.Clear();
            assessment = null;
            updateButton.Enabled = false;
            refreshButton.Enabled = !string.IsNullOrWhiteSpace(exePathBox.Text);
            if (string.IsNullOrWhiteSpace(exePathBox.Text)) return;
            try
            {
                assessment = Assess(Path.GetDirectoryName(exePathBox.Text));
                versionLabel.Text = "当前版本：" + assessment.InstalledVersion;
                compatibilityLabel.Text = assessment.CompatibilityMessage;
                compatibilityLabel.ForeColor = assessment.CanUpdate || assessment.AlreadyCurrent ? Color.FromArgb(33, 105, 72) : Color.FromArgb(167, 58, 40);
                int replaceCount = assessment.Files.Count(f => f.RequiresReplacement);
                summaryLabel.Text = assessment.AlreadyCurrent ? "此安装已包含 " + package.Manifest.version + " 的全部程序文件，无需升级。" : (assessment.CanUpdate ? string.Format("将替换 {0} 个文件，已匹配 {1} 个文件；预计需要 {2} 可用空间（含备份）。", replaceCount, assessment.Files.Count - replaceCount, FormatBytes(assessment.RequiredBytes)) : "请使用师门 " + package.Manifest.baselineVersion + " 的完整安装目录，或改用对应版本的升级包。");
                foreach (FilePlan plan in assessment.Files)
                {
                    ListViewItem item = new ListViewItem(plan.Entry.relativePath.Replace('/', '\\'));
                    item.SubItems.Add(plan.Status);
                    item.SubItems.Add(FormatBytes(plan.Entry.length));
                    fileList.Items.Add(item);
                }
                updateButton.Enabled = assessment.CanUpdate && !assessment.AlreadyCurrent;
            }
            catch (Exception ex)
            {
                versionLabel.Text = "当前版本：无法识别";
                compatibilityLabel.Text = ex.Message;
                compatibilityLabel.ForeColor = Color.FromArgb(167, 58, 40);
                summaryLabel.Text = "未对任何文件作出修改。";
            }
        }

        private UpdateAssessment Assess(string root)
        {
            if (string.IsNullOrWhiteSpace(root) || !File.Exists(Path.Combine(root, "Lmentor.exe")) || !File.Exists(Path.Combine(root, "core", "Lmentor-core.exe")) || !Directory.Exists(Path.Combine(root, "CDXAgent")))
            {
                throw new InvalidOperationException("所选文件不位于有效的师门安装目录。目录中必须包含 Lmentor.exe、core\\Lmentor-core.exe 和 CDXAgent。 ");
            }
            List<FilePlan> plans = new List<FilePlan>();
            bool incompatible = false;
            bool allTarget = true;
            long needed = 0;
            foreach (UpdateEntry entry in package.Manifest.files)
            {
                string destination = UpdatePackage.SafeCombine(root, entry.relativePath);
                string current = File.Exists(destination) ? UpdatePackage.GetSha256(destination) : string.Empty;
                bool target = string.Equals(current, entry.sha256, StringComparison.OrdinalIgnoreCase);
                bool baselineKnown = !string.IsNullOrWhiteSpace(entry.baselineSha256);
                bool baseline = baselineKnown && string.Equals(current, entry.baselineSha256, StringComparison.OrdinalIgnoreCase);
                FilePlan plan = new FilePlan { Entry = entry, InstalledHash = current, RequiresReplacement = !target };
                if (target) plan.Status = "已是目标版本";
                else if (baseline) plan.Status = "将从 " + package.Manifest.baselineVersion + " 替换";
                else if (string.IsNullOrWhiteSpace(current)) { plan.Status = "缺失，将补充"; incompatible = true; }
                else { plan.Status = "文件版本不兼容"; incompatible = true; }
                if (!target) needed += entry.length + (File.Exists(destination) ? new FileInfo(destination).Length : 0L);
                allTarget &= target;
                plans.Add(plan);
            }
            DriveInfo drive = new DriveInfo(Path.GetPathRoot(root));
            bool diskOk = drive.AvailableFreeSpace >= needed;
            UpdateAssessment result = new UpdateAssessment();
            result.InstallRoot = root;
            result.Files = plans;
            result.RequiredBytes = needed;
            result.AlreadyCurrent = allTarget;
            result.CanUpdate = !incompatible && !allTarget && diskOk;
            result.InstalledVersion = allTarget ? package.Manifest.version : (incompatible ? "未知或不兼容版本" : package.Manifest.baselineVersion + "（已验证）");
            result.CompatibilityMessage = !diskOk ? "磁盘可用空间不足，升级至少需要 " + FormatBytes(needed) + "。" : (allTarget ? "兼容：已完成 " + package.Manifest.version + " 升级。" : (incompatible ? "不兼容：检测到非 " + package.Manifest.baselineVersion + " 的程序文件，已阻止升级。" : "兼容：可安全升级到 " + package.Manifest.version + "。"));
            return result;
        }

        private void StartUpdate()
        {
            if (assessment == null || !assessment.CanUpdate) return;
            DialogResult confirmation = MessageBox.Show(this, "升级将替换列表中的程序文件，并在安装目录创建可恢复备份。\r\n\r\n用户配置、API、项目、会话、技能和运行环境不会被修改。\r\n\r\n是否继续？", "确认升级到 " + package.Manifest.version, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (confirmation != DialogResult.Yes) return;
            try
            {
                CloseRunningProcesses();
                SetBusy(true, "正在校验升级包...");
                package.ValidatePackage();
                int changed = ApplyUpdate(assessment);
                SetBusy(false, string.Empty);
                DialogResult launch = MessageBox.Show(
                    this,
                    string.Format("师门已升级到 {0}。\r\n\r\n已替换 {1} 个文件。\r\n替换前的文件已备份至：\r\n{2}\r\n\r\n是否立即启动师门？", package.Manifest.version, changed, Path.Combine(assessment.InstallRoot, ".lmentor-update-backups")),
                    "升级完成",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Information
                );
                if (launch == DialogResult.Yes) {
                    Process.Start(new ProcessStartInfo(Path.Combine(assessment.InstallRoot, "Lmentor.exe")) { UseShellExecute = true });
                }
                AssessSelection();
            }
            catch (Exception ex)
            {
                SetBusy(false, string.Empty);
                MessageBox.Show(this, "升级未完成。已替换的文件将自动尝试恢复。\r\n\r\n" + ex.Message, "升级失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                AssessSelection();
            }
        }

        private void CloseRunningProcesses()
        {
            Process[] processes = Process.GetProcesses().Where(p => string.Equals(p.ProcessName, "Lmentor", StringComparison.OrdinalIgnoreCase) || string.Equals(p.ProcessName, "Lmentor-core", StringComparison.OrdinalIgnoreCase)).ToArray();
            if (processes.Length == 0) return;
            DialogResult confirmation = MessageBox.Show(this, "检测到师门仍在运行。必须关闭后才能替换程序文件。\r\n\r\n是否立即关闭师门并继续？", "关闭正在运行的师门", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (confirmation != DialogResult.Yes) throw new InvalidOperationException("已取消升级，师门仍在运行。");
            foreach (Process process in processes)
            {
                try { if (!process.HasExited) process.Kill(); } catch { }
            }
            System.Threading.Thread.Sleep(900);
        }

        private int ApplyUpdate(UpdateAssessment selected)
        {
            string backupRoot = Path.Combine(selected.InstallRoot, ".lmentor-update-backups", package.Manifest.version + "-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"));
            List<Tuple<string, string>> replacements = new List<Tuple<string, string>>();
            int total = selected.Files.Count(f => f.RequiresReplacement);
            int index = 0;
            try
            {
                foreach (FilePlan plan in selected.Files)
                {
                    if (!plan.RequiresReplacement) continue;
                    index++;
                    SetProgress(index, total, "正在更新 " + plan.Entry.relativePath.Replace('/', '\\'));
                    string source = UpdatePackage.SafeCombine(package.PayloadRoot, plan.Entry.relativePath);
                    string destination = UpdatePackage.SafeCombine(selected.InstallRoot, plan.Entry.relativePath);
                    string backup = UpdatePackage.SafeCombine(backupRoot, plan.Entry.relativePath);
                    if (File.Exists(destination))
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(backup));
                        File.Copy(destination, backup, true);
                    }
                    replacements.Add(Tuple.Create(destination, backup));
                    Directory.CreateDirectory(Path.GetDirectoryName(destination));
                    string temporary = destination + ".lmentor-updating-" + Process.GetCurrentProcess().Id;
                    File.Copy(source, temporary, true);
                    if (!string.Equals(UpdatePackage.GetSha256(temporary), plan.Entry.sha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("临时文件校验失败：" + plan.Entry.relativePath);
                    File.Copy(temporary, destination, true);
                    File.Delete(temporary);
                    if (!string.Equals(UpdatePackage.GetSha256(destination), plan.Entry.sha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("升级后校验失败：" + plan.Entry.relativePath);
                }
                string reportPath = Path.Combine(selected.InstallRoot, ".lmentor-update-last.json");
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                string report = serializer.Serialize(new {
                    version = package.Manifest.version,
                    updatedAt = DateTime.Now.ToString("o"),
                    updatedFiles = replacements.Count,
                    backupRoot = backupRoot,
                    firstLaunchNoticePending = true,
                    releaseNotes = package.Manifest.releaseNotes ?? new List<string>()
                });
                File.WriteAllText(reportPath, report, new UTF8Encoding(false));
                return replacements.Count;
            }
            catch
            {
                for (int i = replacements.Count - 1; i >= 0; i--)
                {
                    try
                    {
                        if (File.Exists(replacements[i].Item2)) File.Copy(replacements[i].Item2, replacements[i].Item1, true);
                    }
                    catch { }
                }
                throw;
            }
        }

        private void SetBusy(bool busy, string text)
        {
            browseButton.Enabled = !busy; refreshButton.Enabled = !busy && !string.IsNullOrWhiteSpace(exePathBox.Text); updateButton.Enabled = !busy && assessment != null && assessment.CanUpdate && !assessment.AlreadyCurrent;
            progress.Visible = busy; progressLabel.Visible = busy; progressLabel.Text = text;
            UseWaitCursor = busy; Cursor = busy ? Cursors.WaitCursor : Cursors.Default;
        }

        private void SetProgress(int value, int maximum, string text)
        {
            progress.Maximum = Math.Max(1, maximum); progress.Value = Math.Min(value, progress.Maximum); progressLabel.Text = text;
            Application.DoEvents();
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes < 1024L * 1024L) return Math.Max(1, bytes / 1024L).ToString() + " KB";
            return (bytes / 1024d / 1024d).ToString("0.0") + " MB";
        }
    }
}

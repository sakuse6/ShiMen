using System;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class LmentorFolderPicker
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (Array.Exists(args, value => string.Equals(value, "--self-test", StringComparison.OrdinalIgnoreCase)))
        {
            return 0;
        }

        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Console.OutputEncoding = new UTF8Encoding(false);

            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            using (Form owner = new Form())
            {
                dialog.Description = "\u9009\u62e9\u9879\u76ee\u6587\u4ef6\u5939";
                dialog.ShowNewFolderButton = true;

                owner.Text = "\u5e08\u95e8";
                owner.TopMost = true;
                owner.ShowInTaskbar = false;
                owner.FormBorderStyle = FormBorderStyle.FixedToolWindow;
                owner.StartPosition = FormStartPosition.CenterScreen;
                owner.Width = 1;
                owner.Height = 1;
                owner.Opacity = 0;
                owner.Show();
                owner.Activate();

                DialogResult result = dialog.ShowDialog(owner);
                if (result == DialogResult.OK && Directory.Exists(dialog.SelectedPath))
                {
                    Console.WriteLine(dialog.SelectedPath);
                }
            }

            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.ToString());
            return 1;
        }
    }
}

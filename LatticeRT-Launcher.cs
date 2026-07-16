// LatticeRT-Launcher.cs - read-only ESAPI launcher for the locally served LatticeRT app.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using VMS.TPS.Common.Model.API;

namespace VMS.TPS
{
    public class Script
    {
        private const string LatticeUrl = "http://localhost:8000/";
        private const string SidecarFileName = "lattice-launch-params.js";

        public void Execute(ScriptContext context)
        {
            try
            {
                if (context.Patient == null)
                {
                    ShowError("No patient is loaded. Please open a patient before running this script.", "Patient Context Error");
                    return;
                }

                if (context.Course == null)
                {
                    ShowError("No course is loaded. Please open a course before running this script.", "Course Context Error");
                    return;
                }

                if (context.PlanSetup == null)
                {
                    ShowError("No plan is loaded. Please open a plan before running this script.", "Plan Context Error");
                    return;
                }

                List<StructureSet> structureSets = GetPatientStructureSets(context);
                if (structureSets.Count == 0)
                {
                    ShowError("No structure sets are available for the open patient.", "Structure Set Error");
                    return;
                }

                LaunchSelection selection = ShowSelectionDialog(structureSets);
                if (selection == null)
                {
                    return;
                }

                string appRoot;
                string searchLocations;
                if (!TryFindLatticeAppRoot(out appRoot, out searchLocations))
                {
                    ShowError(
                        "Could not find the LatticeRT app folder. Expected an index.html in one of these locations:\n\n" + searchLocations,
                        "LatticeRT App Not Found");
                    return;
                }

                string sidecarPath = Path.Combine(appRoot, SidecarFileName);
                string sidecarContents = BuildSidecar(selection.RoiName);
                try
                {
                    File.WriteAllText(sidecarPath, sidecarContents, new UTF8Encoding(false));
                }
                catch (Exception ex)
                {
                    ShowError(
                        "Failed to write the LatticeRT launch sidecar.\n\nPath:\n" + sidecarPath + "\n\nDetails:\n" + ex.Message,
                        "Launch Handoff Write Error");
                    return;
                }

                string verificationError;
                if (!VerifyServedSidecar(sidecarContents, out verificationError))
                {
                    ShowError(
                        "LatticeRT is not being served from the folder that received the launch handoff.\n\n" +
                        "Expected server URL:\n" + LatticeUrl + "\n\n" +
                        "The launcher wrote:\n" + sidecarPath + "\n\n" +
                        verificationError,
                        "LatticeRT Server Not Ready");
                    return;
                }

                Process process = Process.Start(new ProcessStartInfo
                {
                    FileName = LatticeUrl,
                    UseShellExecute = true
                });

                if (process == null)
                {
                    throw new ApplicationException("Failed to start the default browser.");
                }
            }
            catch (ApplicationException ex)
            {
                ShowError(ex.Message, "LatticeRT Launcher Error");
            }
            catch (Exception ex)
            {
                ShowError("An unexpected error occurred:\n\n" + ex.Message, "LatticeRT Launcher Error");
            }
        }

        private static List<StructureSet> GetPatientStructureSets(ScriptContext context)
        {
            var result = new List<StructureSet>();
            var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            AddStructureSets(EnumerateProperty(context.Patient, "StructureSets"), result, seenIds);

            // The active structure set is a useful fallback for ESAPI versions where the patient-level
            // collection is unavailable to a script context.
            if (context.StructureSet != null)
            {
                AddStructureSet(context.StructureSet, result, seenIds);
            }

            result.Sort(delegate(StructureSet a, StructureSet b)
            {
                return string.Compare(a.Id, b.Id, StringComparison.OrdinalIgnoreCase);
            });
            return result;
        }

        private static IEnumerable EnumerateProperty(object instance, string propertyName)
        {
            if (instance == null) return null;

            try
            {
                PropertyInfo property = instance.GetType().GetProperty(propertyName, BindingFlags.Instance | BindingFlags.Public);
                return property == null ? null : property.GetValue(instance, null) as IEnumerable;
            }
            catch
            {
                return null;
            }
        }

        private static void AddStructureSets(IEnumerable candidates, List<StructureSet> destination, HashSet<string> seenIds)
        {
            if (candidates == null) return;
            foreach (object candidate in candidates)
            {
                AddStructureSet(candidate as StructureSet, destination, seenIds);
            }
        }

        private static void AddStructureSet(StructureSet structureSet, List<StructureSet> destination, HashSet<string> seenIds)
        {
            if (structureSet == null || string.IsNullOrWhiteSpace(structureSet.Id)) return;
            if (seenIds.Add(structureSet.Id)) destination.Add(structureSet);
        }

        private static LaunchSelection ShowSelectionDialog(List<StructureSet> structureSets)
        {
            var structureSetOptions = new List<StructureSetOption>();
            foreach (StructureSet structureSet in structureSets)
            {
                var roiOptions = new List<RoiOption>();
                foreach (Structure structure in structureSet.Structures)
                {
                    if (structure == null || structure.IsEmpty || string.IsNullOrWhiteSpace(structure.Id)) continue;
                    roiOptions.Add(new RoiOption(structure.Id, structure.DicomType));
                }

                roiOptions.Sort(delegate(RoiOption a, RoiOption b)
                {
                    return string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase);
                });
                if (roiOptions.Count > 0)
                {
                    structureSetOptions.Add(new StructureSetOption(structureSet, roiOptions));
                }
            }

            if (structureSetOptions.Count == 0)
            {
                ShowError("No structure set for the open patient contains a non-empty ROI.", "Target ROI Error");
                return null;
            }

            var dialog = new Window
            {
                Title = "Launch LatticeRT",
                Width = 500,
                Height = 245,
                MinWidth = 500,
                MinHeight = 245,
                ResizeMode = ResizeMode.NoResize,
                WindowStartupLocation = WindowStartupLocation.CenterScreen,
                ShowInTaskbar = false
            };

            var grid = new Grid { Margin = new Thickness(16) };
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(12) });
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            var structureSetLabel = new TextBlock { Text = "Structure set", Margin = new Thickness(0, 0, 0, 4) };
            Grid.SetRow(structureSetLabel, 0);
            grid.Children.Add(structureSetLabel);

            var structureSetCombo = new ComboBox
            {
                ItemsSource = structureSetOptions,
                DisplayMemberPath = "DisplayName",
                MinWidth = 430
            };
            Grid.SetRow(structureSetCombo, 1);
            grid.Children.Add(structureSetCombo);

            var roiLabel = new TextBlock { Text = "Target ROI", Margin = new Thickness(0, 0, 0, 4) };
            Grid.SetRow(roiLabel, 3);
            grid.Children.Add(roiLabel);

            var roiCombo = new ComboBox { DisplayMemberPath = "DisplayName", MinWidth = 430 };
            Grid.SetRow(roiCombo, 4);
            grid.Children.Add(roiCombo);

            var buttons = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            Grid.SetRow(buttons, 6);
            grid.Children.Add(buttons);

            var cancel = new Button { Content = "Cancel", Width = 82, Margin = new Thickness(0, 0, 8, 0), IsCancel = true };
            var launch = new Button { Content = "Open LatticeRT", Width = 120, IsDefault = true };
            buttons.Children.Add(cancel);
            buttons.Children.Add(launch);

            LaunchSelection selected = null;
            Action populateRois = delegate
            {
                var selectedStructureSet = structureSetCombo.SelectedItem as StructureSetOption;
                roiCombo.ItemsSource = selectedStructureSet == null ? null : selectedStructureSet.RoiOptions;
                roiCombo.SelectedIndex = selectedStructureSet == null ? -1 : 0;
            };

            structureSetCombo.SelectionChanged += delegate { populateRois(); };
            cancel.Click += delegate { dialog.DialogResult = false; };
            launch.Click += delegate
            {
                var selectedStructureSet = structureSetCombo.SelectedItem as StructureSetOption;
                var selectedRoi = roiCombo.SelectedItem as RoiOption;
                if (selectedStructureSet == null || selectedRoi == null) return;

                selected = new LaunchSelection(selectedStructureSet.StructureSet, selectedRoi.Name);
                dialog.DialogResult = true;
            };

            structureSetCombo.SelectedIndex = 0;
            dialog.Content = grid;
            return dialog.ShowDialog() == true ? selected : null;
        }

        private static bool TryFindLatticeAppRoot(out string appRoot, out string searchLocations)
        {
            string sourceFilePath = GetSourceFilePath();
            string launcherPath = !string.IsNullOrEmpty(sourceFilePath) ? Path.GetDirectoryName(sourceFilePath) : null;
            if (string.IsNullOrEmpty(launcherPath)) launcherPath = AppDomain.CurrentDomain.BaseDirectory;

            var candidates = new List<string>
            {
                Path.Combine(launcherPath, "LatticeRT-main", "LatticeRT-main"),
                Path.Combine(launcherPath, "LatticeRT"),
                launcherPath
            };

            searchLocations = string.Join("\n", candidates.ToArray());
            foreach (string candidate in candidates)
            {
                if (File.Exists(Path.Combine(candidate, "index.html")))
                {
                    appRoot = candidate;
                    return true;
                }
            }

            appRoot = null;
            return false;
        }

        private static string BuildSidecar(string roiName)
        {
            return "// Written by the LatticeRT Eclipse launcher.\r\n" +
                   "window.latticeLaunchParams = {\r\n" +
                   "  schemaVersion: 1,\r\n" +
                   "  targetRoiName: " + ToJavaScriptString(roiName) + "\r\n" +
                   "};\r\n";
        }

        private static string ToJavaScriptString(string value)
        {
            var result = new StringBuilder();
            result.Append('"');
            foreach (char c in value ?? string.Empty)
            {
                switch (c)
                {
                    case '\\': result.Append("\\\\"); break;
                    case '"': result.Append("\\\""); break;
                    case '\b': result.Append("\\b"); break;
                    case '\f': result.Append("\\f"); break;
                    case '\n': result.Append("\\n"); break;
                    case '\r': result.Append("\\r"); break;
                    case '\t': result.Append("\\t"); break;
                    case '\u2028': result.Append("\\u2028"); break;
                    case '\u2029': result.Append("\\u2029"); break;
                    default:
                        if (char.IsControl(c)) result.Append("\\u" + ((int)c).ToString("x4"));
                        else result.Append(c);
                        break;
                }
            }
            result.Append('"');
            return result.ToString();
        }

        private static bool VerifyServedSidecar(string expectedContents, out string error)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(LatticeUrl + SidecarFileName + "?t=" + Guid.NewGuid().ToString("N"));
                request.Method = "GET";
                request.Timeout = 3000;
                request.ReadWriteTimeout = 3000;
                request.CachePolicy = new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);

                using (var response = (HttpWebResponse)request.GetResponse())
                using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    string servedContents = reader.ReadToEnd();
                    if (response.StatusCode != HttpStatusCode.OK)
                    {
                        error = "The local server returned HTTP " + (int)response.StatusCode + ".";
                        return false;
                    }
                    if (!string.Equals(servedContents, expectedContents, StringComparison.Ordinal))
                    {
                        error = "The local server returned a different lattice-launch-params.js file.";
                        return false;
                    }
                }

                error = null;
                return true;
            }
            catch (WebException ex)
            {
                error = "Could not reach the local server: " + ex.Message;
                return false;
            }
            catch (Exception ex)
            {
                error = "Could not verify the local server: " + ex.Message;
                return false;
            }
        }

        private static void ShowError(string message, string title)
        {
            MessageBox.Show(message, title, MessageBoxButton.OK, MessageBoxImage.Error);
        }

        public static string GetSourceFilePath([CallerFilePath] string sourceFilePath = "")
        {
            return sourceFilePath;
        }

        private sealed class StructureSetOption
        {
            public StructureSetOption(StructureSet structureSet, List<RoiOption> roiOptions)
            {
                StructureSet = structureSet;
                RoiOptions = roiOptions;
                DisplayName = structureSet.Id + " (" + roiOptions.Count + " non-empty ROIs)";
            }

            public StructureSet StructureSet { get; private set; }
            public List<RoiOption> RoiOptions { get; private set; }
            public string DisplayName { get; private set; }
        }

        private sealed class RoiOption
        {
            public RoiOption(string name, string dicomType)
            {
                Name = name;
                DisplayName = string.IsNullOrWhiteSpace(dicomType) ? name : name + " (" + dicomType + ")";
            }

            public string Name { get; private set; }
            public string DisplayName { get; private set; }
        }

        private sealed class LaunchSelection
        {
            public LaunchSelection(StructureSet structureSet, string roiName)
            {
                StructureSet = structureSet;
                RoiName = roiName;
            }

            public StructureSet StructureSet { get; private set; }
            public string RoiName { get; private set; }
        }
    }
}

# Benchmark: Windows (Windows-MCP), direct MCP vs codemode

- Both paths expose the same four upstream tools (FileSystem, PowerShell, Process, Wait), chosen so no run can capture the screen or send input to the desktop. The real server offers 20 tools, so tool-definition overhead is understated compared with a full install.
- Pass/fail comes from inspecting the files left in the sandbox folder, not from the model's claim.
- Windows-MCP sends its own anonymous telemetry on both paths; it was left on to keep the paths identical.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Reproduce: `npm run bench -- --service windows --runs 3`. Method, metric definitions and limitations: [../README.md](../README.md).

> **Warning:** Gives the model real PowerShell and file access to this PC. Tasks are written to stay inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which is deleted and recreated before every run, but a model can still run arbitrary commands. Run on a machine you are happy to do that on.

_No runs recorded yet._

## Task prompts

Identical text is sent on both paths.

- **files**: Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows. Create the folder report\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). Also create report\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.
- **inventory** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 30 files of several types. Write C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows\logs.csv containing a header line "name,bytes" followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. Reply with one short sentence giving the total size in bytes of all the .log files.
- **organize** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.

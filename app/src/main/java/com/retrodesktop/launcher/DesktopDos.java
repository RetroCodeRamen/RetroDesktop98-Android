package com.retrodesktop.launcher;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.function.BiConsumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.JSONArray;

final class DesktopDos {
    private static final String[] COMMANDS = {"CD", "CLS", "COPY", "DIR", "EDIT", "EXIT", "HELP", "MKDIR",
            "MOVE", "REN", "TREE", "TYPE", "VER"};
    private static final Pattern ARGUMENT = Pattern.compile("\"([^\"]*)\"|([^\\s\"]+)");
    private static final String HELP = "DIR [path or pattern]      List files and folders\n" +
            "CD [folder]                Change directory (CD .. goes up)\n" +
            "TREE [folder] [/F]         Show folders, or files too with /F\n" +
            "TYPE file                  Read a text file\n" +
            "EDIT file                  Open a text file in Notepad\n" +
            "COPY source destination    Copy a file or folder\n" +
            "MOVE source destination    Move a file or folder\n" +
            "REN source new-name        Rename in the same folder\n" +
            "MKDIR folder               Create a folder\n" +
            "CLS   VER   HELP   EXIT\n\nUse quotes for paths with spaces. Example: CD \"C:\\My Documents\"";

    interface ReadText { String read(File file) throws IOException; }

    static final class Result {
        File cwd;
        String text = "";
        File edit;
        boolean clear, exit, changed;

        Result(File cwd) { this.cwd = cwd; }
    }

    static Result run(File root, File cwd, String line, ReadText text, BiConsumer<File, File> moved) throws IOException {
        String commandLine = line.trim().replaceFirst("(?i)^cd(?=[.\\\\/])", "CD ");
        List<String> tokens = arguments(commandLine);
        Result result = new Result(cwd);
        if (tokens.isEmpty()) return result;
        String command = tokens.remove(0).toUpperCase(Locale.ROOT);
        switch (command) {
            case "HELP": case "?":
                result.text = HELP;
                break;
            case "VER":
                result.text = "Retro Desktop 98 [Version 2.4]";
                break;
            case "CLS": result.clear = true; break;
            case "EXIT": result.exit = true; break;
            case "C:": break;
            case "CD": case "CHDIR":
                range(tokens, 0, 1, "CD [folder]");
                result.cwd = WorkspaceFileOps.requireDirectory(WorkspaceFileOps.path(root, cwd, value(tokens)));
                if (tokens.isEmpty()) result.text = DesktopFileCatalog.location(DesktopFileCatalog.relative(root, cwd));
                break;
            case "DIR":
                range(tokens, 0, 1, "DIR [path or pattern]");
                result.text = directory(root, cwd, value(tokens));
                break;
            case "TREE": {
                boolean files = false;
                for (int i = 0; i < tokens.size(); i++) {
                    if ("/F".equalsIgnoreCase(tokens.get(i))) {
                        tokens.remove(i);
                        files = true;
                        break;
                    }
                }
                range(tokens, 0, 1, "TREE [folder] [/F]");
                File parent = WorkspaceFileOps.requireDirectory(WorkspaceFileOps.path(root, cwd, value(tokens)));
                result.text = tree(root, parent, files);
                break;
            }
            case "TYPE": case "EDIT": {
                range(tokens, 1, 1, command + " file");
                File file = WorkspaceFileOps.requireFile(WorkspaceFileOps.path(root, cwd, tokens.get(0)));
                if ("EDIT".equals(command)) result.edit = file;
                else result.text = text.read(file);
                break;
            }
            case "MKDIR": case "MD": {
                range(tokens, 1, 1, "MKDIR folder");
                File folder = WorkspaceFileOps.path(root, cwd, tokens.get(0));
                if (folder.exists()) throw new IOException("That name already exists.");
                WorkspaceFileOps.mkdir(folder);
                result.changed = true;
                result.text = "Directory created.";
                break;
            }
            case "COPY": case "MOVE": case "REN": case "RENAME": {
                range(tokens, 2, 2, command + " source " + (command.startsWith("REN") ? "new-name" : "destination"));
                File source = WorkspaceFileOps.path(root, cwd, tokens.get(0));
                File target;
                if (command.startsWith("REN")) target = WorkspaceFileOps.rename(root, source, tokens.get(1));
                else target = WorkspaceFileOps.transfer(root, source, WorkspaceFileOps.path(root, cwd, tokens.get(1)), "MOVE".equals(command));
                if (!"COPY".equals(command)) moved.accept(source, target);
                if (!"COPY".equals(command) && cwd.toPath().startsWith(source.toPath())) {
                    result.cwd = target.toPath().resolve(source.toPath().relativize(cwd.toPath())).toFile();
                }
                result.changed = true;
                result.text = ("COPY".equals(command) ? "Copied to " : "New location ") +
                        DesktopFileCatalog.location(DesktopFileCatalog.relative(root, target));
                break;
            }
            default:
                result.text = "Bad command or file name. Type HELP for the command list.";
        }
        return result;
    }

    private static List<String> arguments(String line) throws IOException {
        Matcher matcher = ARGUMENT.matcher(line);
        List<String> tokens = new ArrayList<>();
        int end = 0;
        while (matcher.find()) {
            if (!line.substring(end, matcher.start()).trim().isEmpty() ||
                    (end != 0 && matcher.start() == end)) throw new IOException("Put paths with spaces inside quotes.");
            String word = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
            if (word.isEmpty()) throw new IOException("Enter a file or folder name inside the quotes.");
            tokens.add(word);
            end = matcher.end();
        }
        if (!line.substring(end).trim().isEmpty()) throw new IOException("Close the quoted path.");
        return tokens;
    }

    private static void range(List<String> tokens, int min, int max, String usage) throws IOException {
        if (tokens.size() < min || tokens.size() > max) throw new IOException("Usage: " + usage);
    }

    private static String value(List<String> tokens) { return tokens.isEmpty() ? "" : tokens.get(0); }

    private static String directory(File root, File cwd, String input) throws IOException {
        File folder;
        String wildcard = null;
        if (input.contains("*") || input.contains("?")) {
            int slash = lastSeparator(input);
            folder = WorkspaceFileOps.requireDirectory(WorkspaceFileOps.path(root, cwd, input.substring(0, slash + 1)));
            wildcard = input.substring(slash + 1);
        } else {
            folder = WorkspaceFileOps.path(root, cwd, input);
            if (folder.isFile()) {
                wildcard = folder.getName();
                folder = folder.getParentFile();
            } else WorkspaceFileOps.requireDirectory(folder);
        }
        Pattern filter = wildcard == null || wildcard.equals("*.*") ? null : wildcard(wildcard);
        StringBuilder output = new StringBuilder(" Directory of ")
                .append(DesktopFileCatalog.location(DesktopFileCatalog.relative(root, folder))).append("\n\n");
        SimpleDateFormat date = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US);
        int files = 0, directories = 0;
        long bytes = 0;
        for (File item : WorkspaceFileOps.children(folder)) {
            if (filter != null && !filter.matcher(item.getName()).matches()) continue;
            if (files + directories >= 350) { output.append("  [More entries. Narrow the file pattern.]\n"); break; }
            if (item.isDirectory()) directories++;
            else { files++; bytes += item.length(); }
            String size = item.isDirectory() ? "<DIR>" : String.format(Locale.US, "%,d", item.length());
            output.append(String.format(Locale.US, "%s  %11s  %s%n", date.format(new Date(item.lastModified())), size, item.getName()));
        }
        output.append(String.format(Locale.US, "%d file(s)  %,d bytes%n%d dir(s)", files, bytes, directories));
        return output.toString();
    }

    private static Pattern wildcard(String value) {
        StringBuilder expression = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char symbol = value.charAt(i);
            expression.append(symbol == '*' ? ".*" : symbol == '?' ? "." : Pattern.quote(String.valueOf(symbol)));
        }
        return Pattern.compile(expression.toString(), Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    }

    private static String tree(File root, File parent, boolean files) throws IOException {
        StringBuilder output = new StringBuilder(DesktopFileCatalog.location(DesktopFileCatalog.relative(root, parent))).append('\n');
        int[] count = {0};
        branch(parent, "", output, files, count, 0);
        if (count[0] >= 350) output.append("[More entries. Start TREE from a subfolder.]\n");
        return output.toString();
    }

    private static void branch(File directory, String indent, StringBuilder text, boolean files, int[] count, int depth) throws IOException {
        if (depth >= 20) return;
        List<File> rows = WorkspaceFileOps.children(directory);
        if (!files) rows.removeIf(file -> !file.isDirectory());
        for (int index = 0; index < rows.size() && count[0] < 350; index++) {
            File current = rows.get(index);
            boolean last = index == rows.size() - 1;
            text.append(indent).append(last ? "└── " : "├── ").append(current.getName()).append('\n');
            count[0]++;
            if (current.isDirectory()) branch(current, indent + (last ? "    " : "│   "), text, files, count, depth + 1);
        }
    }

    static JSONArray complete(File root, File current, String line) throws IOException {
        JSONArray found = new JSONArray();
        String trimmed = line.replaceFirst("^\\s+", "");
        if (!trimmed.matches(".*\\s.*")) {
            for (String command : COMMANDS) if (command.startsWith(trimmed.toUpperCase(Locale.ROOT))) found.put(command + " ");
            return found;
        }
        int start = 0;
        boolean quoted = false;
        for (int index = 0; index < line.length(); index++) {
            char c = line.charAt(index);
            if (c == '"') quoted = !quoted;
            if (!quoted && Character.isWhitespace(c)) start = index + 1;
        }
        String typed = line.substring(start);
        boolean keepQuotes = typed.startsWith("\"");
        typed = typed.replace("\"", "");
        int slash = lastSeparator(typed);
        String prefix = typed.substring(0, slash + 1);
        String name = typed.substring(slash + 1).toLowerCase(Locale.ROOT);
        File folder = WorkspaceFileOps.path(root, current, prefix);
        if (!folder.isDirectory()) return found;
        String command = trimmed.split("\\s+", 2)[0].toUpperCase(Locale.ROOT);
        boolean directoryOnly = "CD".equals(command) || "CHDIR".equals(command) || "TREE".equals(command);
        for (File file : WorkspaceFileOps.children(folder)) {
            if (found.length() >= 60) break;
            if ((directoryOnly && !file.isDirectory()) || !file.getName().toLowerCase(Locale.ROOT).startsWith(name)) continue;
            if (file.getName().contains("\"")) continue;
            String value = prefix + file.getName();
            if (keepQuotes || value.matches(".*\\s.*")) value = "\"" + value + "\"";
            found.put(line.substring(0, start) + value);
        }
        return found;
    }

    private static int lastSeparator(String value) {
        int slash = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
        return slash >= 0 ? slash : value.matches("(?s)^[a-zA-Z]:.*") ? 1 : -1;
    }
}

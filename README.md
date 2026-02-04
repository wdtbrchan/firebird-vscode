<p align="center">
  <img src="docs/logo.png" alt="Firebird VS Code Logo" width="128" />
</p>

# Firebird SQL

Firebird database management extension for VS Code, Antigravity, Cursor and other VS Code compatible editors.

![Screenshot](docs/screen.png)

## Features

- **SQL Execution**: Run queries (`CTRL+Enter`) and scripts (`CTRL+ALT+Enter`). Supports executing SQL from other files (e.g. PHP) with parameter injection.
- **Transaction Support**: Explicit Commit/Rollback support.
- **Explorer**: View databases, tables, views, procedures, triggers and more.
- **Object Search**: Quickly filter and find database objects.
- **Object Management**: Create and manage tables, views, procedures, triggers, indexes, etc.

## Requirements

- Firebird server access
- VS Code (or compatible like Antigravity, Cursor) 1.80.0 or higher

## Keyboard Shortcuts

- `CTRL+Enter`: Run query
- `CTRL+ALT+Enter`: Run script
- `CTRL+SHIFT+Backspace`: Close query result
- `Ctrl+Alt+Shift+C`: Commit Transaction
- `Ctrl+Alt+Shift+R`: Rollback Transaction

## Basic Usage

1. **Select Firebird**: Click on the Firebird icon in the Activity Bar.
2. **Create Connection**: Click the `+` button in the "Databases" view to add a new connection to your Firebird database (`.fdb` file).
3. **Open SQL File**: Open a file with the `.sql` extension.
4. **Run Query**: Write your SQL query and press `CTRL+Enter` (or `CMD+Enter` on macOs) to run the query or press `CTRL+ALT+Enter` to execute complex scripts with multiple statements (DDLs)
5. **View Results**: The results will be displayed in a separate panel.

## Advanced Usage

### SQL Execution in PHP (Parameter Injection)

You can execute SQL queries directly from PHP (or other configured) files. Use comments to inject values for parameters (`?`).

**Example:**
Highlight the SQL query and press `CTRL+Enter`.

```php
$sql = "
    SELECT
        id,
    FROM PRODUCTS
    WHERE 
        category=? --@val='others'
        and type=? --@val=1
        AND createAt>? /*@val='2026-01-01'*/
    ;
";
```
**Configuration:**
Add "php" to `firebird.allowedLanguages` in VS Code settings to enable this feature for PHP files.


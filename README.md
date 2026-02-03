<p align="center">
  <img src="docs/logo.png" alt="Firebird VS Code Logo" width="128" />
</p>

# Firebird SQL

Firebird database management extension for VS Code, Antigravity, Cursor and other VS Code compatible editors.

![Screenshot](docs/screen.png)

## Features

- **Explorer**: View databases, tables, views, procedures, triggers and more.
- **Object Search**: Quickly filter and find database objects.
- **Index Management**: Manage table indexes (Create, Drop, Activate, Deactivate, Statistics).
- **SQL Execution**: Run queries (CTRL+Enter) and scripts (CTRL+ALT+Enter).
- **Transaction Support**: Explicit Commit/Rollback support.

## Requirements

- Firebird server access
- VS Code 1.80.0 or higher

## Usage

1. **Select Firebird**: Click on the Firebird icon in the Activity Bar.
2. **Create Connection**: Click the `+` button in the "Databases" view to add a new connection to your Firebird database (`.fdb` file).
3. **Open SQL File**: Open a file with the `.sql` extension.
4. **Run Query**: Write your SQL query and press `CTRL+Enter` (or `CMD+Enter` on macOs) to run the query or press `CTRL+ALT+Enter` to execute complex scripts with multiple statements (DDLs)
5. **View Results**: The results will be displayed in a separate panel.

# Changelog

## [ ... ]
### UI Improvements
- **Connection Integration**:
  - Added visual color indicators for active connections in the DB Explorer.
  - Improved color settings application (updates immediately without reload).

## [0.6.1]
### Features
- **Script Management**:
  - **Drag & Drop Reordering**: Added ability to reorder scripts.

## [0.6.0]
### Features
- **Script Management**:
  - **Global & Local Scripts**: Added dedicated folders for "Local Scripts" (specific to a connection) and "Global Scripts" (shared across all connections).
  - **Inline Actions**: Simplified UI with inline buttons for creating scripts, folders, and adding existing scripts.
  - **Rename Folders**: Added ability to rename script folders.
- **Object Creation**:
  - **Inline Create Buttons**: Replaced tree items with inline `(+)` buttons for creating new Tables, Views, Triggers, Procedures, and Generators.

## [0.5.1]
### Documentation
- Updated `README.md` with detailed examples for SQL execution in PHP (Parameter Injection).

## [0.5.0]
### Features
- **SQL Execution in Other Files**:
  - Execute SQL queries from non-SQL files (e.g., PHP) using `Ctrl+Enter`.
  - Configurable via `firebird.allowedLanguages` setting.
  - **Parameter Injection**: Support for injecting parameter values using comments (e.g., `--@val=1` or `/*@val='text'*/`).
- **Improved Explorer**:
  - Added **Create new...** actions for Tables, Views, Triggers, Procedures, and Generators to easily create new objects from templates.
- **General**:
  - Added "Run Query" and "Run Script" commands to the "Firebird" category in the Command Palette.

## [0.4.0]
### Features
- **Trigger Management**:
  - Added support for Activating, Deactivating, and Dropping triggers.
  - Improved display of inactive triggers.
- **Explorer Improvements**:
  - **Object Search**: Added live filtering for Tables, Views, Triggers, Procedures, and Generators.
  - **Trigger Groups**: Improved grouping logic (collapsed by default, auto-expanded when searching).
- **Query Results**:
  - Added keyboard shortcut `Ctrl+Shift+Backspace` to close the results panel.

## [0.3.0]
### Features
- **Index Management**:
  - Added support for creating, dropping, activating/deactivating indexes and recomputing index statistics.
- **Database Management**:
  - Added **Refresh Database** action to reload connection metadata.
  - Implemented auto-refresh of database tree after executing DDL commands (CREATE, ALTER, DROP).
- **Query Results**:
  - Display executed query snippet (start of query) in the results panel header.

## [0.2.3]
### Fixes
- **Object Viewer**:
  - Replaced custom HTML viewer with native VS Code read-only editor.
  - Fixed issue where data type lengths (e.g., `VARCHAR(12)`) were not displayed correctly.
  - Enabled native SQL syntax highlighting for object definitions.

## [0.2.2]
### Fixes
- **Connection Status**:
  - Fixed startup behavior to ensure all connections start as disconnected/inactive.
  - Enabled "Connect" and "Edit" context menu actions for failed connections.

## [0.2.0]
### Features
- **Databases Tree**:
  - Added Tables, Views, Procedures, Triggers, and Generators to the database tree.
- **Query Execution**:
  - Added support for `CTRL+ALT+ENTER` to execute scripts with multiple statements (DDLs).
- **Connection Health & UX**:
  - Added loading states to connection items to provide better feedback during connection verification.
  - Database groups now expand by default for better visibility.

## [0.1.6]
### Features
- **UI Improvements**:
  - Added loading state indicators to the connection tree.
  - Swapped transaction button positions for better ergonomics.

## [0.1.1 - 0.1.5]
### Features
- **Database Management**:
  - Added the ability to rename database groups.
- **Transaction Management**:
  - Implemented Commit and Rollback functionality.
  - Added an automatic rollback counter/timer to prevent long-running open transactions.
  - Improved transaction status display in the UI.
- **Query Execution**:
  - Added support for the `RETURNING` clause in queries to fetch results.
  - Added cursor positioning to exact error locations in the SQL editor.
  - Display execution time and row counts in query results.
  - Refined the results panel UI.

## [0.1.0]
### Features
  - Added Firebird database connection support and GUI.
  - Query execution (`CTRL+Enter`).
  - Results viewing in a separate panel with support for pagination.
  - Transaction support (Commit/Rollback).

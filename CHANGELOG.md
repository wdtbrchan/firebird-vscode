# Changelog

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

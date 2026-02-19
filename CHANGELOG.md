
## [1.2.2]
### Fixes
- **Query Extraction**: Fixed SQL detection failing in files with multiple string literals before the SQL query.

## [1.2.1]
### Fixes
- **Query Extraction**: Replaced naive backward-scanning string detection with a robust forward-scanning tokenizer. This fixes incorrect SQL extraction in non-SQL files (e.g. PHP) when comments contain unmatched quotes or SQL comments (`--`) appear inside string literals.

## [1.2.0]
### Features
- **CodeLens**: Added "Run Script" CodeLens for `SET TERM` blocks and "Run Query" CodeLens for standard queries.

### Fixes
- **Query Extraction**: Fixed an issue where the `SET TERM` block would be active when the cursor was at the start of a subsequent SQL statement.


## [1.1.0]
### Features
- **DDL Generation**: Added support for including `GRANT` permissions in generated DDL scripts for Procedures and Tables.
- **Documentation**: Updated `README.md` and screenshot to reflect new features (Copy to Clipboard, Enhanced Table Info).

## [1.0.0]
### Features
- **Query Results**: Added context menu with options to **Copy Value**, **Copy Column**, and **Copy Table** (formatted for Excel).
- **Triggers**: Added toggle between triggers subtree and triggers list
- **Table Info**: Enhanced Columns view to show Primary Key (PK) and Foreign Key (FK) tags.
- **Table Info**: Foreign Key tags now display the target table and column in a tooltip.
- **Table Info**: Indexes in the Columns view are now displayed in a 2-column grid layout for better readability.
- **Table Info**: Hovering over an Index tag now shows the list of columns covered by that index.
- **Table Info**: Improved loading screen with a centered spinner.

## [0.16.0]
### Features
- **Query Execution**: Implemented **Incremental Fetching** using low-level database cursors (`statement.fetch`). This replaces the previous `FIRST/SKIP` pagination, providing better performance and avoiding SQL syntax conflicts.
- **Query Results**: The "Load More" button is now disabled and displays status (e.g., "(Rolled back)") when the transaction is closed.

### Internal / Refactoring
- **Query Execution**: Removed the `paginationUtils` module as automatic query modification is no longer necessary.
- **Database Layer**: Updated `TransactionManager` to maintain active statement state across multiple fetch requests.

## [0.15.0]
### Features
- **Explorer**: Refined interaction for Database Objects (Tables, Views, Triggers, Procedures, Generators). Clicking an item now only selects/expands it to prevent accidental opening of large files.
- **Explorer**: Added **Info button** for Tables, Indexes, and Generators to view detailed information (Structure, Statistics, Values) in a dedicated panel.
- **Explorer**: Added **View Source button** for Triggers, Procedures, Views, and Functions to view the SQL definition in a window.
- **Table Info**: Implemented a rich **Table Info View** displaying Columns, Indexes, Triggers, Dependencies, and Permissions.
- **Index Info**: Implemented a rich **Index Info View** displaying detailed index properties and statistics.
- **Generator Info**: Implemented a **Generator Info View** displaying the generator name and current value.

### Fixes
- **Query Results**: Added "Query executed successfully" message to the "No rows returned" state.

## [0.14.3]
### Fixes
- **Explorer**: Added support for dynamic (expression-based) indexes in generated DDL.
- **CodeLens**: Fixed CodeLens detection for SQL scripts using `SET TERM` blocks (CodeLens now covers the entire script block instead of internal statements).
- **Explorer**: Fixed extra empty lines in generated DDL for procedures around `DECLARE VARIABLE` and `BEGIN`.

## [0.14.2]
### Fixes
- **Query Execution**: Fixed an issue where queries with `ROWS` clause would fail due to conflicting automatic pagination (`FIRST`/`SKIP`).

## [0.14.1]
### Fixes
- **Query Results**: Fixed incorrect affected rows count for `UPDATE` statements using subqueries.

### Internal / Refactoring
- **Results Panel**: Refactored monolithic `resultsPanel.ts` into a modular folder structure with separate template files for HTML, CSS, JS, icons, and page assembly.
- **Explorer**: Refactored monolithic `databaseTreeDataProvider.ts` into modular sub-managers (`connectionManager`, `groupManager`, `favoritesManager`, `backupRestoreManager`).
- **Extension Entry**: Refactored monolithic `extension.ts` into modular `commands/` directory, `contextKeys.ts`, and `statusBar.ts`.

## [0.14.0]
### Features
- **Explorer**: Refined Drag and Drop behavior for Connections, Groups, Scripts, and Favorites. 
- **Explorer**: Added "DDL Script" option to Triggers context menu.
- **Explorer**: Added "Drop" option for Procedures, Tables, Views, and Generators.
- **Explorer**: Database objects (tables, views, procedures, etc.) are now sorted alphabetically.
- **CodeLens**: Added `firebird.enableCodeLensInNonSqlFiles` setting to control CodeLens visibility in non-SQL files (disabled by default).

### Fixes
- **Explorer**: Fixed Drag and Drop initialization where empty data transfer items were preventing the operation from starting.
- **Explorer**: Improved type detection (duck typing) for tree items during Drag and Drop to handle cases where `instanceof` checks fail.

## [0.13.0]
### Features
- **CodeLens**:
  - Improved SQL detection in non-SQL files: CodeLens now only appears when SQL keywords are detected.
  - Hidden default "Active Database" CodeLens in non-SQL files when no SQL is detected.

### UI / UX
- **Results Panel**:
  - Updated transaction status colors (Green/Red) to be less saturated and more consistent with VS Code themes.
  - Adjusted "Executing..." bar to use a neutral dark gray background instead of green.
  - Unified transaction icons.

## [0.12.0]
### Features
- **CodeLens Enhancements**:
  - Added database connection folder (group) name to the CodeLens display in the editor.
  - CodeLens now dynamically positions above the active SQL query based on cursor location.
  - Added "End of query" CodeLens marker for better visual block identification.
  - Enabled CodeLens support for all configured `firebird.allowedLanguages`.
- **Settings**:
  - Added setting `firebird.useEmptyLineAsSeparator` to treat empty lines (two or more newlines) as SQL statement separators.
  - Added `firebird.enableCodeLens` to toggle the Active Connection CodeLens.
- **Transaction Safety**: Added automatic rollback when closing the query results panel to prevent stuck transactions.
### UI / UX
- **Results Panel**: Swapped positions of Commit and Rollback buttons for better ergonomics.
- **Query Execution**: Preserved editor focus and cursor position after query execution to allow seamless typing.
### Testing
- Added comprehensive unit tests for query extraction and script parsing logic.


## [0.11.0]
### UI / UX
- **Results Panel Redesign**: Complete overhaul of the results panel with a modern block-based layout.
  - Full-width sticky headers and "Executing..." status bar.
  - Colored banners for "No rows returned" and "Affected rows", matching the active connection color.
  - Improved layout for transaction buttons and status.
  - Hover effect on table rows for better readability.
- **Load More Results**:
  - "Load More" button is now a full-width colored bar matching the connection.
  - Added "Loading..." state to prevent duplicate requests.
- **Settings Button**: Added a gear icon button to the DB Explorer title bar to quickly open Firebird-related settings.

### Fixes
- Fixed an issue where `_affectedRows` or stale execution time would persist after a failed query.
- Fixed an issue where "Unknown Database" was displayed in the results panel info bar when a query resulted in an SQL error.

## [0.10.0]
### Features
- Added **Backup and Restore** functionality for database connections (including favorites and scripts).

### Fixes
- Fixed an issue where queries ending with a comment caused an error.
- Fixed alignment glitch in Database Explorer.

## [0.9.2]
### Features
- **Favorites**: Added support for adding and removing triggers from favorites.
- **Favorites**: Added "Clear All Favorites" with a confirmation dialog.

### UI Improvements
- **Explorer**: Improved initial loading state by showing a spinner immediately instead of flashing the "Add Database" button.

### Fixes
- **Favorites**: Fixed an issue where favorite items in subfolders sometimes could not be removed.
- **Favorites**: Fixed individual deletion for indexes and views by using more robust matching and case-insensitive labels.

### Internal / Refactoring
- **Codebase Organization**: Split the monolithic `databaseTreeDataProvider.ts` into multiple specialized files for better maintainability.
- **Unified Loading**: Centralized database object loading and filtering logic to reduce code duplication.
- **Testing**:
  - Established a unit testing framework for explorer components.
  - Implemented unit tests for primary TreeItem classes (`FolderItem`, `ObjectItem`, `TriggerItem`, `IndexItem`, `FavoritesRootItem`).

## [0.9.1]
### UI Improvements
- **Connection Settings**:
  - Redesigned the editor to use a two-column layout for a more compact view.
  - Added icons to buttons (Save, Cancel, Delete).
  - Changed the "Save" button color to a distinct dark green.
  - Replaced native charset/locale selection with a custom autocomplete for better positioning and "show all on focus" behavior.

### Fixes
- **Explorer**: Fixed alignment glitch for the last database connection in a folder by adding a dummy padding item.

## [0.9.0]
### Features
- **Favorites**:
  - Added a favorites list for objects (tables, views, triggers, etc.) and scripts.

## [0.8.0]
### Features
- **Query Execution**:
  - **Parameter Injection**: Added support for named parameters (e.g. `:id`) and `@value` tag in comments (e.g. `col=:id -- @value=1`).
- **Smart SQL Extraction**:
  - Improved `Ctrl+Enter` support for PHP (and other languages) strings (single/double quoted) and method chaining (e.g. `$db->query("...")`).  

## [0.7.2]
### UI Improvements
- **Query Results**:
  - Restyled query result header and removed top reserved space above header.  
- **Explorer Icons**:
  - Added specific icons for Table Indexes (Key) and Triggers (Zap) within the Table view.

## [0.7.1]
### Fixes
- **Query Pagination**: Fixed pagination syntax to use `FIRST/SKIP` instead of `ROWS` for better compatibility with older Firebird versions.
- **Dependencies**: Downgraded `uuid` package to v8 for better compatibility with Cursor.

## [0.7.0]
### UI Improvements
- **Connection Integration**:
  - Added visual color indicators for active connections in the DB Explorer.
  - Improved color settings application (updates immediately without reload).
- **Explorer Icons**:
  - Added specific icons for Tables, Views, ... for better readability.

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

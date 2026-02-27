import { ConnectionGroup } from '../explorer/treeItems/databaseItems';
import { DatabaseConnection } from '../database/types';

/**
 * Generates the full HTML for the Connection Editor webview.
 */
export function getConnectionEditorHtml(
    extensionUri: any,
    groups: ConnectionGroup[],
    connection?: DatabaseConnection
): string {
    // Pre-fill values
    const id = connection?.id || Date.now().toString();
    const name = connection?.name || '';
    const groupId = connection?.groupId || '';
    const host = connection?.host || '127.0.0.1';
    const port = connection?.port || 3050;
    const database = connection?.database || '';
    const user = connection?.user || 'SYSDBA';
    const password = connection?.password || '';
    const role = connection?.role || '';
    const charset = connection?.charset || 'UTF8';
    const resultLocale = connection?.resultLocale || '';
    const shortcutSlot = connection?.shortcutSlot || 0;

    const slotOptions = [
        { value: 0, label: 'None' },
        { value: 1, label: 'Slot 1 (Ctrl+Alt+1)' },
        { value: 2, label: 'Slot 2 (Ctrl+Alt+2)' },
        { value: 3, label: 'Slot 3 (Ctrl+Alt+3)' },
        { value: 4, label: 'Slot 4 (Ctrl+Alt+4)' },
        { value: 5, label: 'Slot 5 (Ctrl+Alt+5)' },
        { value: 6, label: 'Slot 6 (Ctrl+Alt+6)' },
        { value: 7, label: 'Slot 7 (Ctrl+Alt+7)' },
        { value: 8, label: 'Slot 8 (Ctrl+Alt+8)' },
        { value: 9, label: 'Slot 9 (Ctrl+Alt+9)' }
    ].map(s => `<option value="${s.value}" ${s.value === shortcutSlot ? 'selected' : ''}>${s.label}</option>`).join('');

    const locales = [
        { code: '', label: 'Default (Global Setting)' },
        { code: 'en-US', label: 'English (United States)' },
        { code: 'cs-CZ', label: 'Czech (Czech Republic)' },
        { code: 'de-DE', label: 'German (Germany)' },
        { code: 'fr-FR', label: 'French (France)' },
        { code: 'es-ES', label: 'Spanish (Spain)' },
        { code: 'it-IT', label: 'Italian (Italy)' },
        { code: 'pl-PL', label: 'Polish (Poland)' },
        { code: 'ru-RU', label: 'Russian (Russia)' },
        { code: 'pt-BR', label: 'Portuguese (Brazil)' },
        { code: 'zh-CN', label: 'Chinese (Simplified)' },
        { code: 'ja-JP', label: 'Japanese (Japan)' },
    ];
    const localeCodes = locales.map(l => l.code).filter(c => c);

    const commonCharsets = [
        'NONE', 'UTF8', 'ASCII', 'OCTETS', 'UNICODE_FSS', 
        'WIN1250', 'WIN1251', 'WIN1252', 'WIN1253', 'WIN1254', 'WIN1255', 'WIN1256', 'WIN1257', 'WIN1258',
        'ISO8859_1', 'ISO8859_2', 'ISO8859_3', 'ISO8859_4', 'ISO8859_5', 'ISO8859_6', 'ISO8859_7', 'ISO8859_8', 'ISO8859_9', 'ISO8859_13',
        'BIG_5', 'GB2312', 'KSC_5601', 'SJIS', 'CYRL', 'DOS437', 'DOS850', 'DOS852', 'DOS857', 'DOS860', 'DOS861', 'DOS863', 'DOS865'
    ];
    const isEdit = !!connection;

    const groupOptions = groups.map(g => `<option value="${g.id}" ${g.id === groupId ? 'selected' : ''}>${g.name}</option>`).join('');
    const defaultGroupOption = `<option value="" ${!groupId ? 'selected' : ''}>None (Root)</option>`;

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Firebird Connection</title>
            <link href="${extensionUri}/node_modules/@vscode/codicons/dist/codicon.css" rel="stylesheet" />
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet" >
            ${getStyles()}
        </head>
        <body>
            <h2>${isEdit ? 'Edit Connection' : 'New Connection'}</h2>
            ${getFormHtml(name, defaultGroupOption, groupOptions, slotOptions, host, port, database, user, password, role, charset, resultLocale, connection)}
            ${getActionsHtml(isEdit)}
            ${getScriptHtml(id, commonCharsets, localeCodes)}
        </body>
        </html>`;
}

function getStyles(): string {
    return `<style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
                .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .full-width { grid-column: span 2; }
                .form-group { margin-bottom: 5px; position: relative; }
                label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 0.9em; }
                input, select { width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); box-sizing: border-box; }
                .autocomplete-items { position: absolute; border: 1px solid var(--vscode-input-border); border-bottom: none; border-top: none; z-index: 99; top: 100%; left: 0; right: 0; max-height: 200px; overflow-y: auto; background-color: var(--vscode-dropdown-background); }
                .autocomplete-items div { padding: 8px; cursor: pointer; border-bottom: 1px solid var(--vscode-input-border); color: var(--vscode-dropdown-foreground); }
                .autocomplete-items div:hover { background-color: var(--vscode-list-hoverBackground); }
                .autocomplete-active { background-color: var(--vscode-list-activeSelectionBackground) !important; color: var(--vscode-list-activeSelectionForeground) !important; }
                .actions { margin-top: 30px; display: flex; gap: 10px; justify-content: flex-end; align-items: center; border-top: 1px solid var(--vscode-panel-border); padding-top: 20px; }
                button { padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font-weight: 500; }
                button:hover { background: var(--vscode-button-hoverBackground); }
                button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                button.save { background: #1e7e34; color: white; }
                button.save:hover { background: #155d25; }
                button.danger { background: var(--vscode-charts-red); color: white; margin-right: auto; }
                button.danger:hover { opacity: 0.9; }
                .spacer { flex-grow: 1; }
            </style>`;
}

function getFormHtml(
    name: string, defaultGroupOption: string, groupOptions: string, slotOptions: string,
    host: string, port: number, database: string, user: string, password: string,
    role: string, charset: string, resultLocale: string, connection?: DatabaseConnection
): string {
    return `<div class="form-grid">
                <div class="form-group full-width">
                    <label>Name (Alias)</label>
                    <input type="text" id="name" value="${name}" placeholder="My Database">
                </div>
                <div class="form-group">
                    <label>Folder / Group</label>
                    <select id="groupId">
                        ${defaultGroupOption}
                        ${groupOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Shortcut Slot</label>
                    <select id="shortcutSlot">
                        ${slotOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Host</label>
                    <input type="text" id="host" value="${host}">
                </div>
                <div class="form-group">
                    <label>Port</label>
                    <input type="number" id="port" value="${port}">
                </div>
                <div class="form-group full-width">
                    <label>Database Path (.fdb)</label>
                    <input type="text" id="database" value="${database.replace(/\\/g, '\\\\')}"> 
                </div>
                <div class="form-group">
                    <label>User</label>
                    <input type="text" id="user" value="${user}">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="password" value="${password}">
                </div>
                <div class="form-group">
                    <label>Role</label>
                    <input type="text" id="role" value="${role}">
                </div>
                <div class="form-group">
                    <label>Charset</label>
                    <div class="autocomplete">
                         <input type="text" id="charset" value="${charset}" placeholder="UTF8">
                    </div>
                </div>
                <div class="form-group">
                    <label>Result Locale (Format)</label>
                    <div class="autocomplete">
                        <input type="text" id="resultLocale" value="${resultLocale}" placeholder="en-US">
                    </div>
                </div>
                <div class="form-group">
                    <label>Connection Color / Environment</label>
                    <select id="color">
                        <option value="" ${!connection?.color ? 'selected' : ''}>None</option>
                        <option value="blue" ${connection?.color === 'blue' ? 'selected' : ''}>🟦 Blue</option>
                        <option value="green" ${connection?.color === 'green' ? 'selected' : ''}>🟩 Green (Development)</option>
                        <option value="orange" ${connection?.color === 'orange' ? 'selected' : ''}>🟧 Orange</option>
                        <option value="purple" ${connection?.color === 'purple' ? 'selected' : ''}>🟪 Purple</option>
                        <option value="red" ${connection?.color === 'red' ? 'selected' : ''}>🟥 Red (Production)</option>
                        <option value="yellow" ${connection?.color === 'yellow' ? 'selected' : ''}>🟨 Yellow</option>
                    </select>
                </div>
            </div>`;
}

function getActionsHtml(isEdit: boolean): string {
    return `<div class="actions">
                ${isEdit ? `
                <button class="danger" onclick="deleteConnection()">
                    <i class="fa-solid fa-trash-can"></i> Delete
                </button>` : ''}
                ${!isEdit ? '<div class="spacer"></div>' : ''} 
                <button class="secondary" onclick="cancel()">
                    <i class="fa-solid fa-xmark"></i> Cancel
                </button>
                <button class="save" onclick="save()">
                    <i class="fa-solid fa-floppy-disk"></i> Save
                </button>
            </div>`;
}

function getScriptHtml(id: string, commonCharsets: string[], localeCodes: string[]): string {
    return `<script>
                const vscode = acquireVsCodeApi();

                const possibleCharsets = ${JSON.stringify(commonCharsets)};
                const possibleLocales = ${JSON.stringify(localeCodes)};

                function autocomplete(inp, arr) {
                    let currentFocus;
                    
                    function showList(filterVal) {
                        closeAllLists();
                        if (!filterVal && filterVal !== '') return;
                        
                        currentFocus = -1;
                        const a = document.createElement("DIV");
                        a.setAttribute("id", inp.id + "autocomplete-list");
                        a.setAttribute("class", "autocomplete-items");
                        inp.parentNode.appendChild(a);
                        
                        let count = 0;
                        const valUpper = filterVal.toUpperCase();
                        
                        for (let i = 0; i < arr.length; i++) {
                            if (filterVal === '' || arr[i].toUpperCase().indexOf(valUpper) > -1) {
                                const b = document.createElement("DIV");
                                b.innerHTML = arr[i];
                                b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
                                b.addEventListener("click", function(e) {
                                    e.stopPropagation();
                                    inp.value = this.getElementsByTagName("input")[0].value;
                                    closeAllLists();
                                });
                                a.appendChild(b);
                                count++;
                            }
                        }
                    }

                    inp.addEventListener("input", function(e) {
                        showList(this.value);
                    });

                    inp.addEventListener("click", function(e) {
                        e.stopPropagation();
                        showList(""); 
                    });

                    inp.addEventListener("focus", function() {
                         showList("");
                    });
                    
                    inp.addEventListener("keydown", function(e) {
                        let x = document.getElementById(this.id + "autocomplete-list");
                        if (x) x = x.getElementsByTagName("div");
                        if (e.keyCode == 40) {
                            currentFocus++;
                            addActive(x);
                        } else if (e.keyCode == 38) {
                            currentFocus--;
                            addActive(x);
                        } else if (e.keyCode == 13) {
                            e.preventDefault();
                            if (currentFocus > -1) {
                                if (x) x[currentFocus].click();
                            }
                        }
                    });

                    function addActive(x) {
                        if (!x) return false;
                        removeActive(x);
                        if (currentFocus >= x.length) currentFocus = 0;
                        if (currentFocus < 0) currentFocus = (x.length - 1);
                        x[currentFocus].classList.add("autocomplete-active");
                        x[currentFocus].scrollIntoView({block: "nearest"});
                    }

                    function removeActive(x) {
                        for (let i = 0; i < x.length; i++) {
                            x[i].classList.remove("autocomplete-active");
                        }
                    }

                    function closeAllLists(elmnt) {
                        const x = document.getElementsByClassName("autocomplete-items");
                        for (let i = 0; i < x.length; i++) {
                            if (elmnt != x[i] && elmnt != inp) {
                                x[i].parentNode.removeChild(x[i]);
                            }
                        }
                    }
                    
                    document.addEventListener("click", function (e) {
                        closeAllLists(e.target);
                    });
                }

                autocomplete(document.getElementById("charset"), possibleCharsets);
                autocomplete(document.getElementById("resultLocale"), possibleLocales);

                function save() {
                    const conn = {
                        id: '${id}',
                        name: document.getElementById('name').value,
                        groupId: document.getElementById('groupId').value,
                        host: document.getElementById('host').value,
                        port: parseInt(document.getElementById('port').value),
                        database: document.getElementById('database').value,
                        user: document.getElementById('user').value,
                        password: document.getElementById('password').value,
                        role: document.getElementById('role').value,
                        charset: document.getElementById('charset').value,
                        resultLocale: document.getElementById('resultLocale').value,
                        shortcutSlot: parseInt(document.getElementById('shortcutSlot').value),
                        color: document.getElementById('color').value
                    };
                    vscode.postMessage({ command: 'save', connection: conn });
                }

                function cancel() {
                    vscode.postMessage({ command: 'cancel' });
                }

                function deleteConnection() {
                    const conn = {
                         id: '${id}',
                         name: document.getElementById('name').value
                    };
                    vscode.postMessage({ command: 'delete', connection: conn });
                }
            </script>`;
}

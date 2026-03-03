const vscode = acquireVsCodeApi();

function init() {
    const data = window.INITIAL_DATA;
    if (!data) return;

    // Set title
    document.getElementById('formTitle').innerText = data.isEdit ? 'Edit Connection' : 'New Connection';

    // Populate slot options
    const slotSelect = document.getElementById('shortcutSlot');
    const slots = [
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
    ];
    slots.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.value;
        opt.innerText = s.label;
        if (s.value === data.shortcutSlot) opt.selected = true;
        slotSelect.appendChild(opt);
    });

    // Populate group options
    const groupSelect = document.getElementById('groupId');
    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.innerText = "None (Root)";
    if (!data.groupId) defaultOpt.selected = true;
    groupSelect.appendChild(defaultOpt);

    data.groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.name;
        if (g.id === data.groupId) opt.selected = true;
        groupSelect.appendChild(opt);
    });

    // Set values
    document.getElementById('name').value = data.name || '';
    document.getElementById('host').value = data.host || '127.0.0.1';
    document.getElementById('port').value = data.port || 3050;
    // Replace double backslashes with single for display
    document.getElementById('database').value = (data.database || '').replace(/\\\\/g, '\\');
    document.getElementById('user').value = data.user || 'SYSDBA';
    document.getElementById('password').value = data.password || '';
    document.getElementById('role').value = data.role || '';
    document.getElementById('charset').value = data.charset || 'UTF8';
    document.getElementById('resultLocale').value = data.resultLocale || '';

    const colorSelect = document.getElementById('color');
    colorSelect.value = data.color || '';

    // Show/hide delete button
    if (data.isEdit) {
        document.getElementById('deleteBtn').style.display = 'inline-flex';
    } else {
        document.getElementById('deleteSpacer').style.display = 'block';
    }

    setupAutocomplete(data.commonCharsets, data.localeCodes);
}

function setupAutocomplete(commonCharsets, localeCodes) {
    autocomplete(document.getElementById("charset"), commonCharsets);
    autocomplete(document.getElementById("resultLocale"), localeCodes);
}

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

function save() {
    const data = window.INITIAL_DATA;
    const conn = {
        id: data.id,
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
    const data = window.INITIAL_DATA;
    const conn = {
         id: data.id,
         name: document.getElementById('name').value
    };
    vscode.postMessage({ command: 'delete', connection: conn });
}

// Initialize when DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);

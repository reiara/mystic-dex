// MysticDex Companion Application JavaScript (jQuery with SQLite WASM)
$(document).ready(function() {

    let db = null;
    let activeCharacterFilter = 'all';
    let activeRouteFilter = null;

    // --- HELPER FUNCTION FOR SQL.JS ---
    // Executes a query with optional parameters and returns an array of objects
    function queryDB(sql, params = {}) {
        if (!db) return [];
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
    }

    // --- INITIALIZE THEME ---
    let currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        $('html').attr('data-theme', 'dark');
        $('.theme-toggle-btn svg').html('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />');
    }

    // --- INITIALIZE SQLITE DATABASE (WASM) ---
    // Setup locateFile for SQL.js WASM resources from CDN
    const config = {
        locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}`
    };

    initSqlJs(config).then(function(SQL) {
        // Fetch the seeded database binary
        fetch('mysticdex.db')
            .then(response => {
                if (!response.ok) {
                    throw new Error("Unable to fetch SQLite database file.");
                }
                return response.arrayBuffer();
            })
            .then(buffer => {
                const uInt8Array = new Uint8Array(buffer);
                db = new SQL.Database(uInt8Array);
                
                // Initialize the UI elements once database is loaded
                renderCharacters();
                renderRouteChips();
                renderWalkthroughs();
                renderEmails();
            })
            .catch(error => {
                console.error("SQLite initialization error:", error);
                alert("Failed to load SQLite database. Make sure you serve the project directory via an HTTP server.");
            });
    });

    // --- THEME TOGGLER ---
    $('.theme-toggle-btn').on('click', function() {
        if ($('html').attr('data-theme') === 'dark') {
            $('html').removeAttr('data-theme');
            localStorage.setItem('theme', 'light');
            $(this).find('svg').html('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />');
        } else {
            $('html').attr('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            $(this).find('svg').html('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />');
        }
    });

    // --- TAB SYSTEM NAVIGATION ---
    $('.bottom-nav .nav-item').on('click', function() {
        const targetTab = $(this).data('tab');
        
        // Update Nav Class
        $('.bottom-nav .nav-item').removeClass('active');
        $(this).addClass('active');

        // Update Content Class
        $('.tab-content').removeClass('active');
        $(`#tab-${targetTab}`).addClass('active');

        // Reset scroll position
        $('.app-content').scrollTop(0);
    });

    // Feature Card Click (Helper to switch tab)
    $(document).on('click', '.feature-card.walkthrough-card', function() {
        $('.bottom-nav .nav-item[data-tab="walkthrough"]').trigger('click');
    });

    $(document).on('click', '.feature-card.email-card', function() {
        $('.bottom-nav .nav-item[data-tab="emails"]').trigger('click');
    });

    // --- RENDERING DYNAMIC DATA ---

    // Fetch and render RFA character filter chips (excluding MC)
    function renderCharacters() {
        const $list = $('#char-chips-list');
        $list.empty();

        const allActive = activeCharacterFilter === 'all' ? 'active' : '';
        $list.append(`<button class="char-chip ${allActive}" data-char="all">All</button>`);

        const characters = queryDB("SELECT * FROM characters WHERE id != 'mc';");
        characters.forEach(char => {
            const activeClass = activeCharacterFilter === char.id ? 'active' : '';
            $list.append(`
                <button class="char-chip ${activeClass}" data-char="${char.id}">
                    <img src="${char.avatar}" alt="${char.name}" class="char-avatar" />
                    <span>${char.name}</span>
                </button>
            `);
        });
    }

    // Sort ordering for standard routes
    const routeOrder = [
        "DAY 1", "Casual Story", "Deep Story", "Another Story",
        "Yoosung Route", "Zen Route", "Jaehee Route", "Jumin Route",
        "707 Route", "V Route", "Ray Route"
    ];

    // Render horizontal route filter chips
    function renderRouteChips() {
        const $chipsList = $('#route-chips-list');
        $chipsList.empty();

        const allActive = activeRouteFilter === null ? 'active' : '';
        $chipsList.append(`<button class="route-chip ${allActive}" data-route="all">All Stories</button>`);

        const dbRoutes = queryDB("SELECT DISTINCT route FROM chatrooms").map(r => r.route);
        dbRoutes.sort((a, b) => {
            const idxA = routeOrder.indexOf(a);
            const idxB = routeOrder.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        dbRoutes.forEach(route => {
            const activeClass = activeRouteFilter === route ? 'active' : '';
            $chipsList.append(`<button class="route-chip ${activeClass}" data-route="${route}">${route}</button>`);
        });
    }

    // Render gorgeous route selector grid landing menu
    function renderRouteSelectorGrid() {
        const $list = $('#walkthroughs-list');
        $list.empty();

        const container = $('<div class="route-selector-container"></div>');
        container.append('<h3 class="route-selector-title">Select a Story / Route</h3>');

        const grid = $('<div class="route-selector-grid"></div>');

        const routeMeta = {
            "DAY 1": { desc: "The beginning of your journey. Common to Casual & Deep stories.", type: "casual-story" },
            "Casual Story": { desc: "Days 2-4. Unlock routes for Yoosung, Zen, and Jaehee.", type: "casual-story" },
            "Deep Story": { desc: "Days 2-4. Unlock routes for Jumin and 707.", type: "deep-story" },
            "Another Story": { desc: "Days 1-4. Unlock routes for V and Ray.", type: "another-story" },
            "Yoosung Route": { desc: "Days 5-11. Help Yoosung find his path in life.", type: "character-route" },
            "Zen Route": { desc: "Days 5-11. Support Zen's acting career.", type: "character-route" },
            "Jaehee Route": { desc: "Days 5-11. Assist Jaehee in finding her passion.", type: "character-route" },
            "Jumin Route": { desc: "Days 5-11. Navigate Jumin's complex emotions.", type: "character-route" },
            "707 Route": { desc: "Days 5-11. Uncover the truth with Luciel.", type: "character-route" },
            "V Route": { desc: "Days 5-11. Seek truth and healing with V.", type: "character-route" },
            "Ray Route": { desc: "Days 5-11. Save Saeran from his darkness.", type: "character-route" }
        };

        const dbRoutes = queryDB("SELECT DISTINCT route FROM chatrooms").map(r => r.route);
        dbRoutes.sort((a, b) => {
            const idxA = routeOrder.indexOf(a);
            const idxB = routeOrder.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        dbRoutes.forEach(route => {
            const meta = routeMeta[route] || { desc: "Play special walkthrough schedules and endings.", type: "dlc-route" };
            const card = $(`
                <div class="route-card ${meta.type}" data-route="${route}">
                    <div class="route-card-name">${route}</div>
                    <div class="route-card-desc">${meta.desc}</div>
                </div>
            `);
            grid.append(card);
        });

        container.append(grid);
        $list.append(container);
    }

    // Fetch and render chatrooms list matching filters/search query
    function renderWalkthroughs(searchQuery = '') {
        const $list = $('#walkthroughs-list');
        
        // If no route selected and no search query, show Route Selector Grid
        if (activeRouteFilter === null && searchQuery.trim() === '') {
            renderRouteSelectorGrid();
            return;
        }

        $list.empty();

        let sql = `
            SELECT DISTINCT c.id, c.route, c.day, c.title, c.time
            FROM chatrooms c
        `;
        let params = {};
        let whereClauses = [];

        // If filter is active, join with participants table
        if (activeCharacterFilter !== 'all') {
            sql += ` JOIN chatroom_participants cp ON c.id = cp.chatroom_id`;
            whereClauses.push(`cp.character_id = :charId`);
            params[':charId'] = activeCharacterFilter;
        }

        if (activeRouteFilter) {
            whereClauses.push(`c.route = :route`);
            params[':route'] = activeRouteFilter;
        }

        // Apply Search query filter if typed
        if (searchQuery) {
            whereClauses.push(`(c.title LIKE :search OR c.route LIKE :search)`);
            params[':search'] = `%${searchQuery}%`;
        }

        if (whereClauses.length > 0) {
            sql += ` WHERE ` + whereClauses.join(' AND ');
        }

        sql += ` ORDER BY c.day ASC, c.time ASC;`;

        const chatrooms = queryDB(sql, params);

        if (chatrooms.length === 0) {
            $list.append(`
                <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                    No chatrooms found matching filters.
                </div>
            `);
            return;
        }

        // Group chatrooms by day
        const daysMap = {};
        chatrooms.forEach(room => {
            if (!daysMap[room.day]) {
                daysMap[room.day] = [];
            }
            daysMap[room.day].push(room);
        });

        // For each day, render a day container
        Object.keys(daysMap).sort((a, b) => Number(a) - Number(b)).forEach(dayNum => {
            const dayChatrooms = daysMap[dayNum];
            
            const $dayGroup = $(`
                <div class="walkthrough-day-group">
                    <div class="walkthrough-day-header">
                        <span>Day ${dayNum}</span>
                        <svg class="day-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                    <div class="walkthrough-day-content"></div>
                </div>
            `);

            const $dayContent = $dayGroup.find('.walkthrough-day-content');

            dayChatrooms.forEach(room => {
                // Get participants for this chatroom
                const participants = queryDB(`
                    SELECT c.id, c.name, c.avatar 
                    FROM chatroom_participants cp 
                    JOIN characters c ON cp.character_id = c.id 
                    WHERE cp.chatroom_id = :roomId;
                `, { ':roomId': room.id });

                // Get dialogue/choices
                const elements = queryDB(`
                    SELECT id, type, character_id, content, recommended_for_character_id 
                    FROM chats_and_choices 
                    WHERE chatroom_id = :roomId 
                    ORDER BY id ASC;
                `, { ':roomId': room.id });

                // Generate participants avatars HTML (excluding MC to look clean)
                let avatarsHTML = '';
                participants.forEach(p => {
                    if (p.id !== 'mc') {
                        avatarsHTML += `<img src="${p.avatar}" title="${p.name}" alt="${p.name}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border);" />`;
                    }
                });

                // Build Chat bubbles list
                let chatHTML = '';
                elements.filter(el => el.type === 'bubble').forEach(bubble => {
                    const charObj = participants.find(p => p.id === bubble.character_id) || { name: bubble.character_id, avatar: '' };
                    const isMC = bubble.character_id === 'mc';

                    if (isMC) {
                        chatHTML += `
                            <div class="chat-bubble-row mc">
                                <div class="chat-bubble">
                                    ${bubble.content}
                                </div>
                            </div>
                        `;
                    } else {
                        chatHTML += `
                            <div class="chat-bubble-row other">
                                <div>
                                    <span class="chat-sender-name">${charObj.name}</span>
                                    <div class="chat-bubble">
                                        ${bubble.content}
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                });

                // Build Choice Options list
                let choicesHTML = '';
                elements.filter(el => el.type === 'choice').forEach(choice => {
                    const benefitsChar = choice.recommended_for_character_id;
                    const recClass = benefitsChar ? 'recommended' : '';
                    
                    // Show which character route the choice benefits
                    let recLabel = '';
                    if (benefitsChar) {
                        const beneficiary = queryDB("SELECT name FROM characters WHERE id = :charId;", { ':charId': benefitsChar });
                        if (beneficiary.length > 0) {
                            recLabel = `<span class="choice-rec-tag" style="background-color: var(--success-border); color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; font-weight: 600; float: right; text-transform: uppercase;">+${beneficiary[0].name} Heart</span>`;
                        }
                    }

                    choicesHTML += `
                        <div class="choice-option ${recClass}">
                            ${recLabel}
                            ${choice.content}
                        </div>
                    `;
                });

                const $chatItem = $(`
                    <div class="walkthrough-chat-item">
                        <div class="walkthrough-chat-header">
                            <div class="walkthrough-chat-info">
                                <span class="walkthrough-chat-meta">${room.route}</span>
                                <h4 class="walkthrough-chat-title">${room.time} - ${room.title}</h4>
                            </div>
                            <div class="walkthrough-chat-right">
                                <div style="display: flex; gap: 4px; align-items: center;">
                                    ${avatarsHTML}
                                </div>
                                <svg class="chat-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                            </div>
                        </div>
                        <div class="walkthrough-chat-content">
                            <div class="chat-simulator-body" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px;">
                                ${chatHTML}
                            </div>
                            <div class="choices-container">
                                ${choicesHTML}
                            </div>
                        </div>
                    </div>
                `);

                $dayContent.append($chatItem);
            });

            $list.append($dayGroup);
        });
    }


    // Fetch and render guest emails list matching search query
    function renderEmails(searchQuery = '') {
        const $list = $('#emails-list');
        $list.empty();

        let sql = `
            SELECT 
                e.id, 
                e.sender, 
                e.answer1, 
                e.answer2, 
                e.answer3,
                c.route AS chatroom_route,
                c.day AS chatroom_day,
                c.title AS chatroom_title,
                c.time AS chatroom_time
            FROM emails e
            LEFT JOIN chatrooms c ON e.chatroom_id = c.id
        `;
        let params = {};

        if (searchQuery) {
            sql += `
                WHERE e.sender LIKE :search 
                OR e.answer1 LIKE :search 
                OR e.answer2 LIKE :search 
                OR e.answer3 LIKE :search
                OR chatroom_title LIKE :search
                OR chatroom_route LIKE :search
            `;
            params[':search'] = `%${searchQuery}%`;
        }

        sql += ` ORDER BY e.sender ASC;`;

        const emails = queryDB(sql, params);

        if (emails.length === 0) {
            $list.append(`
                <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                    No email guides found matching criteria.
                </div>
            `);
            return;
        }

        emails.forEach(email => {
            const triggerLocation = email.chatroom_route 
                ? `${email.chatroom_route} - Day ${email.chatroom_day} at ${email.chatroom_time} (${email.chatroom_title})`
                : 'Unknown / Special Condition';

            $list.append(`
                <div class="email-card-item">
                    <div class="email-header-row">
                        <div class="email-sender">
                            <span>${email.sender}</span>
                        </div>
                    </div>
                    
                    <div class="email-location" style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 12px; font-weight: 500;">
                        <span class="text-pink" style="font-weight: 600;">Found in:</span> ${triggerLocation}
                    </div>
                    
                    <div class="email-answers">
                        <div class="email-answer-step">
                            <span class="step-num">#1</span>
                            <span>${email.answer1}</span>
                        </div>
                        <div class="email-answer-step">
                            <span class="step-num">#2</span>
                            <span>${email.answer2}</span>
                        </div>
                        <div class="email-answer-step">
                            <span class="step-num">#3</span>
                            <span>${email.answer3}</span>
                        </div>
                    </div>
                </div>
            `);
        });
    }

    // --- INTERACTIVE EVENTS ---

    // Toggle Day accordion in walkthrough
    $(document).on('click', '.walkthrough-day-header', function() {
        $(this).closest('.walkthrough-day-group').toggleClass('expanded');
    });

    // Toggle Chatroom accordion in walkthrough
    $(document).on('click', '.walkthrough-chat-header', function() {
        $(this).closest('.walkthrough-chat-item').toggleClass('expanded');
    });

    // Chip Filter Selection (Characters)
    $(document).on('click', '.char-chip', function() {
        activeCharacterFilter = $(this).data('char');
        
        // Re-render chips and filter walkthroughs list
        renderCharacters();
        renderWalkthroughs($('#search-walkthrough').val());
    });

    // Route Chip Filter Selection
    $(document).on('click', '.route-chip', function() {
        const route = $(this).data('route');
        if (route === 'all') {
            activeRouteFilter = null;
        } else {
            activeRouteFilter = route;
        }
        renderRouteChips();
        renderWalkthroughs($('#search-walkthrough').val());
    });

    // Route Card Selection
    $(document).on('click', '.route-card', function() {
        const route = $(this).data('route');
        activeRouteFilter = route;
        renderRouteChips();
        renderWalkthroughs($('#search-walkthrough').val());
    });

    // Walkthrough input search box handler
    $('#search-walkthrough').on('input', function() {
        renderWalkthroughs($(this).val());
    });

    // Email input search box handler
    $('#search-emails').on('input', function() {
        renderEmails($(this).val());
    });

});

// MysticDex Companion Application JavaScript (jQuery with SQLite WASM)
$(document).ready(function() {

    let db = null;
    let activeCharacterFilter = 'all';
    let activeRouteFilter = null;
    let acceptedEmailIds = [];
    try {
        acceptedEmailIds = JSON.parse(localStorage.getItem('mysticdex_accepted_emails') || '[]');
    } catch (e) {
        console.error("Failed to load accepted emails:", e);
    }

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
                renderTracker();
                initGameTracker();
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

        const dbRoutes = queryDB(`
            SELECT DISTINCT 
                   COALESCE(r.name || ' Route', CASE WHEN s.name = 'Common' THEN 'DAY 1' ELSE s.name END) AS route
            FROM chatrooms c
            LEFT JOIN routes r ON c.route_id = r.id
            LEFT JOIN story_modes s ON c.story_mode_id = s.id
        `).map(r => r.route);

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

        const dbRoutes = queryDB(`
            SELECT DISTINCT 
                   COALESCE(r.name || ' Route', CASE WHEN s.name = 'Common' THEN 'DAY 1' ELSE s.name END) AS route
            FROM chatrooms c
            LEFT JOIN routes r ON c.route_id = r.id
            LEFT JOIN story_modes s ON c.story_mode_id = s.id
        `).map(r => r.route);

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
            SELECT DISTINCT c.id, 
                   COALESCE(r.name || ' Route', CASE WHEN s.name = 'Common' THEN 'DAY 1' ELSE s.name END) AS route, 
                   c.day, c.title, c.time
            FROM chatrooms c
            LEFT JOIN routes r ON c.route_id = r.id
            LEFT JOIN story_modes s ON c.story_mode_id = s.id
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
            if (activeRouteFilter === 'DAY 1') {
                whereClauses.push(`c.story_mode_id = 1`);
            } else if (activeRouteFilter === 'Casual Story') {
                whereClauses.push(`c.story_mode_id = 2 AND c.route_id IS NULL`);
            } else if (activeRouteFilter === 'Deep Story') {
                whereClauses.push(`c.story_mode_id = 3 AND c.route_id IS NULL`);
            } else if (activeRouteFilter === 'Another Story') {
                whereClauses.push(`c.story_mode_id = 4 AND c.route_id IS NULL`);
            } else {
                // Character Route (e.g. "Zen Route")
                const charName = activeRouteFilter.replace(' Route', '');
                const routeRows = queryDB("SELECT id, story_mode_id FROM routes WHERE name = :name", { ':name': charName });
                if (routeRows.length > 0) {
                    const rId = routeRows[0].id;
                    const smId = routeRows[0].story_mode_id;
                    // Zen route progression query: Common Day 1 OR (Casual Common days AND route_id is NULL) OR Zen Route specific days
                    whereClauses.push(`(c.story_mode_id = 1 OR (c.story_mode_id = :smId AND c.route_id IS NULL) OR c.route_id = :rId)`);
                    params[':smId'] = smId;
                    params[':rId'] = rId;
                } else {
                    whereClauses.push(`1 = 0`);
                }
            }
        }

        // Apply Search query filter if typed
        if (searchQuery) {
            whereClauses.push(`(c.title LIKE :search OR COALESCE(r.name || ' Route', CASE WHEN s.name = 'Common' THEN 'DAY 1' ELSE s.name END) LIKE :search)`);
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
                e.email_id, 
                e.sender, 
                e.answer_1, 
                e.answer_2, 
                e.answer_3,
                COALESCE(r.name || ' Route', CASE WHEN s.name = 'Common' THEN 'DAY 1' ELSE s.name END) AS chatroom_route,
                c.day AS chatroom_day,
                c.title AS chatroom_title,
                c.time AS chatroom_time
            FROM emails e
            LEFT JOIN email_chatroom ec ON e.email_id = ec.email_id
            LEFT JOIN chatrooms c ON ec.chatroom_id = c.id
            LEFT JOIN routes r ON c.route_id = r.id
            LEFT JOIN story_modes s ON c.story_mode_id = s.id
        `;
        let params = {};

        if (searchQuery) {
            sql += `
                WHERE e.email_id IN (
                    SELECT DISTINCT e2.email_id
                    FROM emails e2
                    WHERE e2.sender LIKE :search
                )
            `;
            params[':search'] = `%${searchQuery}%`;
        }

        sql += ` ORDER BY e.sender ASC;`;

        const rows = queryDB(sql, params);

        if (rows.length === 0) {
            $list.append(`
                <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                    No email guides found matching criteria.
                </div>
            `);
            return;
        }

        // Group rows by email_id to handle multiple chatrooms
        const emailMap = {};
        rows.forEach(row => {
            if (!emailMap[row.email_id]) {
                emailMap[row.email_id] = {
                    email_id: row.email_id,
                    sender: row.sender,
                    answer_1: row.answer_1,
                    answer_2: row.answer_2,
                    answer_3: row.answer_3,
                    chatrooms: []
                };
            }
            if (row.chatroom_route) {
                // Check if this chatroom is already added to avoid duplicates (if any)
                const isDuplicate = emailMap[row.email_id].chatrooms.some(
                    r => r.route === row.chatroom_route && 
                         r.day === row.chatroom_day && 
                         r.title === row.chatroom_title && 
                         r.time === row.chatroom_time
                );
                if (!isDuplicate) {
                    emailMap[row.email_id].chatrooms.push({
                        route: row.chatroom_route,
                        day: row.chatroom_day,
                        title: row.chatroom_title,
                        time: row.chatroom_time
                    });
                }
            }
        });

        const emails = Object.values(emailMap);
        // Sort by sender alphabetically
        emails.sort((a, b) => a.sender.localeCompare(b.sender));

        emails.forEach(email => {
            const isAccepted = acceptedEmailIds.includes(email.email_id);
            const acceptBtnText = isAccepted ? '✓ Accepted' : 'Accept';
            const acceptBtnClass = isAccepted ? 'accept-btn active' : 'accept-btn';

            let locationsHTML = '';
            if (email.chatrooms.length === 0) {
                locationsHTML = `<span>Unknown / Special Condition</span>`;
            } else if (email.chatrooms.length === 1) {
                const room = email.chatrooms[0];
                locationsHTML = `<span>${room.route} - Day ${room.day} at ${room.time} (${room.title})</span>`;
            } else {
                locationsHTML = `<ul style="margin: 6px 0 0 12px; padding-left: 12px; list-style-type: disc; display: flex; flex-direction: column; gap: 4px;">`;
                email.chatrooms.forEach(room => {
                    locationsHTML += `<li>${room.route} - Day ${room.day} at ${room.time} (${room.title})</li>`;
                });
                locationsHTML += `</ul>`;
            }

            $list.append(`
                <div class="email-card-item">
                    <div class="email-header-row">
                        <div class="email-sender">
                            <span>${email.sender}</span>
                        </div>
                        <button class="${acceptBtnClass}" data-email-id="${email.email_id}">
                            ${acceptBtnText}
                        </button>
                    </div>
                    
                    <div class="email-location" style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 12px; font-weight: 500;">
                        <span style="font-weight: 600; color: var(--accent-pink);">Found in:</span> ${locationsHTML}
                    </div>
                    
                    <div class="email-answers">
                        ${email.answer_1 && email.answer_1.trim() ? `
                        <div class="email-answer-step">
                            <span class="step-num">#1</span>
                            <span>${email.answer_1}</span>
                        </div>` : ''}
                        ${email.answer_2 && email.answer_2.trim() ? `
                        <div class="email-answer-step">
                            <span class="step-num">#2</span>
                            <span>${email.answer_2}</span>
                        </div>` : ''}
                        ${email.answer_3 && email.answer_3.trim() ? `
                        <div class="email-answer-step">
                            <span class="step-num">#3</span>
                            <span>${email.answer_3}</span>
                        </div>` : ''}
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

    // Render tracker function
    function renderTracker() {
        const $list = $('#tracker-list');
        $list.empty();

        if (acceptedEmailIds.length === 0) {
            $list.append(`
                <div class="tracker-empty-state" style="text-align: center; color: var(--text-muted); border: 1px dashed var(--border); padding: 24px; border-radius: var(--radius-lg); font-size: 0.85rem; background-color: var(--card-hover-bg); margin-top: 4px;">
                    No active email guides tracked.
                    <div style="font-size: 0.75rem; margin-top: 6px; color: var(--text-muted); opacity: 0.8;">Click "Accept" on any email in the Emails tab to keep track of it here.</div>
                </div>
            `);
            return;
        }

        // Query database for details of accepted emails
        const sql = `
            SELECT 
                e.email_id, 
                e.sender, 
                e.answer_1, 
                e.answer_2, 
                e.answer_3,
                COALESCE(r.name || ' Route', CASE WHEN s.name = 'Common' THEN 'DAY 1' ELSE s.name END) AS chatroom_route,
                c.day AS chatroom_day,
                c.title AS chatroom_title,
                c.time AS chatroom_time
            FROM emails e
            LEFT JOIN email_chatroom ec ON e.email_id = ec.email_id
            LEFT JOIN chatrooms c ON ec.chatroom_id = c.id
            LEFT JOIN routes r ON c.route_id = r.id
            LEFT JOIN story_modes s ON c.story_mode_id = s.id
            WHERE e.email_id IN (${acceptedEmailIds.join(',')})
        `;

        const rows = queryDB(sql);

        const emailMap = {};
        rows.forEach(row => {
            if (!emailMap[row.email_id]) {
                emailMap[row.email_id] = {
                    email_id: row.email_id,
                    sender: row.sender,
                    answer_1: row.answer_1,
                    answer_2: row.answer_2,
                    answer_3: row.answer_3,
                    chatrooms: []
                };
            }
            if (row.chatroom_route) {
                const isDuplicate = emailMap[row.email_id].chatrooms.some(
                    r => r.route === row.chatroom_route && 
                         r.day === row.chatroom_day && 
                         r.title === row.chatroom_title && 
                         r.time === row.chatroom_time
                );
                if (!isDuplicate) {
                    emailMap[row.email_id].chatrooms.push({
                        route: row.chatroom_route,
                        day: row.chatroom_day,
                        title: row.chatroom_title,
                        time: row.chatroom_time
                    });
                }
            }
        });

        const trackerEmails = Object.values(emailMap);
        // Sort tracker list by sender alphabetically
        trackerEmails.sort((a, b) => a.sender.localeCompare(b.sender));

        trackerEmails.forEach(email => {
            let locationsHTML = '';
            if (email.chatrooms.length === 0) {
                locationsHTML = `<span>Unknown / Special Condition</span>`;
            } else if (email.chatrooms.length === 1) {
                const room = email.chatrooms[0];
                locationsHTML = `<span>${room.route} - Day ${room.day} at ${room.time}</span>`;
            } else {
                locationsHTML = `<ul style="margin: 4px 0 0 12px; padding-left: 12px; list-style-type: disc; display: flex; flex-direction: column; gap: 2px;">`;
                email.chatrooms.forEach(room => {
                    locationsHTML += `<li>${room.route} - Day ${room.day} at ${room.time}</li>`;
                });
                locationsHTML += `</ul>`;
            }

            $list.append(`
                <div class="email-card-item tracker-card-item" data-email-id="${email.email_id}" style="cursor: pointer; transition: all 0.2s ease;">
                    <div class="email-header-row" style="margin-bottom: 0;">
                        <div class="email-sender">
                            <span>${email.sender}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button class="remove-tracker-btn" data-email-id="${email.email_id}" title="Remove from Tracker" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: flex; align-items: center; transition: color 0.2s;" onmouseover="this.style.color='var(--accent-pink)'" onmouseout="this.style.color='var(--text-muted)'">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                            <svg class="tracker-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s ease; color: var(--text-muted);">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </div>
                    </div>
                    
                    <div class="tracker-details" style="display: none; margin-top: 10px;">
                        <div class="email-location" style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 8px;">
                            <span style="font-weight: 600; color: var(--accent-pink);">Found in:</span> ${locationsHTML}
                        </div>
                        
                        <div class="email-answers" style="padding: 8px; gap: 4px;">
                            ${email.answer_1 && email.answer_1.trim() ? `
                            <div class="email-answer-step" style="font-size: 0.75rem;">
                                <span class="step-num">#1</span>
                                <span>${email.answer_1}</span>
                            </div>` : ''}
                            ${email.answer_2 && email.answer_2.trim() ? `
                            <div class="email-answer-step" style="font-size: 0.75rem;">
                                <span class="step-num">#2</span>
                                <span>${email.answer_2}</span>
                            </div>` : ''}
                            ${email.answer_3 && email.answer_3.trim() ? `
                            <div class="email-answer-step" style="font-size: 0.75rem;">
                                <span class="step-num">#3</span>
                                <span>${email.answer_3}</span>
                            </div>` : ''}
                        </div>
                    </div>
                </div>
            `);
        });
    }

    // Toggle Accept status on button click
    $(document).on('click', '.accept-btn', function(e) {
        e.stopPropagation();
        const emailId = parseInt($(this).data('email-id'), 10);
        const idx = acceptedEmailIds.indexOf(emailId);
        if (idx === -1) {
            acceptedEmailIds.push(emailId);
        } else {
            acceptedEmailIds.splice(idx, 1);
        }
        localStorage.setItem('mysticdex_accepted_emails', JSON.stringify(acceptedEmailIds));
        
        renderEmails($('#search-emails').val());
        renderTracker();
    });

    // Remove single email from tracker via trash button
    $(document).on('click', '.remove-tracker-btn', function(e) {
        e.stopPropagation();
        const emailId = parseInt($(this).data('email-id'), 10);
        const idx = acceptedEmailIds.indexOf(emailId);
        if (idx !== -1) {
            acceptedEmailIds.splice(idx, 1);
            localStorage.setItem('mysticdex_accepted_emails', JSON.stringify(acceptedEmailIds));
            
            renderTracker();
            renderEmails($('#search-emails').val());
        }
    });

    // Reset all emails tracked
    $(document).on('click', '#reset-tracker-btn', function(e) {
        e.stopPropagation();
        if (acceptedEmailIds.length === 0) return;
        if (confirm("Are you sure you want to reset all email tracker statuses back to pending?")) {
            acceptedEmailIds = [];
            localStorage.setItem('mysticdex_accepted_emails', JSON.stringify(acceptedEmailIds));
            
            renderTracker();
            renderEmails($('#search-emails').val());
        }
    });

    // Toggle Email tracker card accordion
    $(document).on('click', '.tracker-card-item', function() {
        $(this).toggleClass('expanded');
        $(this).find('.tracker-details').slideToggle(200);
    });

    // --- REAL-TIME GAME TRACKER MODULE ---
    let showPastChatrooms = false;

    // Load Game Tracker config
    function initGameTracker() {
        const configStr = localStorage.getItem('mysticdex_tracker_config');
        if (configStr) {
            try {
                const config = JSON.parse(configStr);
                $('#tracker-start-date').val(config.startDate);
                $('#tracker-start-time').val(config.startTime);
                $('#tracker-route-select').val(config.route);
                renderLiveSchedule(config);
            } catch (e) {
                console.error("Error parsing tracker config:", e);
                showGameTrackerConfig();
            }
        } else {
            showGameTrackerConfig();
        }
    }

    function showGameTrackerConfig() {
        $('#game-tracker-config').show();
        $('#live-schedule-card').hide();
    }

    // Render live progression schedule
    function renderLiveSchedule(config) {
        $('#game-tracker-config').hide();
        $('#live-schedule-card').css('display', 'flex');

        const now = new Date();
        const startDayStr = `${config.startDate}T${config.startTime}`;
        const startDateTime = new Date(startDayStr);

        // Calendar Day Calculations (Midnight-to-Midnight)
        const startDateMidnight = new Date(startDateTime.getFullYear(), startDateTime.getMonth(), startDateTime.getDate());
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffTime = todayMidnight - startDateMidnight;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const currentGameDay = diffDays + 1; // Day 1-indexed

        $('#live-route-badge').text(`${config.route} Route`);

        const $list = $('#live-chatrooms-list');
        $list.empty();

        if (currentGameDay < 1) {
            $('#live-day-badge').text("Upcoming");
            $list.append(`
                <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">
                    Game starts on ${config.startDate} at ${config.startTime}.
                </div>
            `);
            return;
        }

        if (currentGameDay > 11) {
            $('#live-day-badge').text("Route Finished");
            $list.append(`
                <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">
                    Your route completed on Day 11. Edit start to track a new progression!
                </div>
            `);
            return;
        }

        $('#live-day-badge').text(`Day ${currentGameDay}`);

        // Query database to get route_id and story_mode_id
        const routeRows = queryDB("SELECT id, story_mode_id FROM routes WHERE name = :name", { ':name': config.route });
        if (routeRows.length === 0) {
            $list.append(`<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 20px;">Selected route not found in database.</div>`);
            return;
        }

        const rId = routeRows[0].id;
        const smId = routeRows[0].story_mode_id;

        // Query chatrooms for currentDayNum in this progression:
        // Common Day 1, or Story Mode common days, or Character Route specific days.
        const chatrooms = queryDB(`
            SELECT c.id, c.day, c.title, c.time,
                   COALESCE(r.name || ' Route', CASE WHEN s.name = 'Common' THEN 'DAY 1' ELSE s.name END) AS route
            FROM chatrooms c
            LEFT JOIN routes r ON c.route_id = r.id
            LEFT JOIN story_modes s ON c.story_mode_id = s.id
            WHERE c.day = :day
              AND (c.story_mode_id = 1 OR (c.story_mode_id = :smId AND c.route_id IS NULL) OR c.route_id = :rId)
            ORDER BY c.time ASC;
        `, { ':day': currentGameDay, ':smId': smId, ':rId': rId });

        if (chatrooms.length === 0) {
            $list.append(`<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 20px;">No scheduled chatrooms found for today.</div>`);
            return;
        }

        // Tag chatrooms as Active, Past, or Upcoming
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayDateStr = `${yyyy}-${mm}-${dd}`;

        // Find the index of the active chatroom
        let activeIdx = -1;
        
        const parsedChats = chatrooms.map((room, idx) => {
            const chatTimeStr = `${todayDateStr}T${room.time}`;
            const chatDateTime = new Date(chatTimeStr);
            const passed = chatDateTime <= now;

            let isMissedOnDay1 = false;
            if (currentGameDay === 1) {
                const startHourMinStr = config.startTime; // "HH:MM"
                if (room.time < startHourMinStr) {
                    isMissedOnDay1 = true;
                }
            }

            return {
                ...room,
                chatDateTime,
                passed,
                isMissedOnDay1
            };
        });

        // Determine active: last one that has passed and was not missed on Day 1
        for (let i = parsedChats.length - 1; i >= 0; i--) {
            if (parsedChats[i].passed && !parsedChats[i].isMissedOnDay1) {
                activeIdx = i;
                break;
            }
        }

        parsedChats.forEach((room, idx) => {
            let status = 'upcoming';
            let badgeText = 'Upcoming';
            
            if (idx === activeIdx) {
                status = 'active';
                badgeText = 'Active';
            } else if (idx < activeIdx || room.isMissedOnDay1) {
                status = 'past';
                badgeText = 'Past';
            }

            // Get dialogue/choices
            const elements = queryDB(`
                SELECT id, type, character_id, content, recommended_for_character_id 
                FROM chats_and_choices 
                WHERE chatroom_id = :roomId 
                ORDER BY id ASC;
            `, { ':roomId': room.id });

            // Generate participants avatars html
            const participants = queryDB(`
                SELECT c.id, c.name, c.avatar 
                FROM chatroom_participants cp 
                JOIN characters c ON cp.character_id = c.id 
                WHERE cp.chatroom_id = :roomId;
            `, { ':roomId': room.id });

            let avatarsHTML = '';
            participants.forEach(p => {
                if (p.id !== 'mc') {
                    avatarsHTML += `<img src="${p.avatar}" title="${p.name}" alt="${p.name}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border);" />`;
                }
            });

            let chatHTML = '';
            elements.filter(el => el.type === 'bubble').forEach(bubble => {
                const charObj = participants.find(p => p.id === bubble.character_id) || { name: bubble.character_id, avatar: '' };
                const isMC = bubble.character_id === 'mc';

                if (isMC) {
                    chatHTML += `
                        <div class="chat-bubble-row mc" style="margin-bottom: 4px;">
                            <div class="chat-bubble" style="padding: 8px 12px; font-size: 0.8rem; background-color: var(--bubble-mc); color: var(--bubble-mc-text); border-bottom-right-radius: 4px; max-width: 80%; border-radius: var(--radius-bubble); box-shadow: var(--shadow-sm); word-break: break-word;">
                                ${bubble.content}
                            </div>
                        </div>
                    `;
                } else {
                    chatHTML += `
                        <div class="chat-bubble-row other" style="margin-bottom: 4px;">
                            <div>
                                <span class="chat-sender-name" style="font-size: 0.7rem; margin-bottom: 2px; font-weight: 600; color: var(--text-secondary); display: block;">${charObj.name}</span>
                                <div class="chat-bubble" style="padding: 8px 12px; font-size: 0.8rem; background-color: var(--bubble-other); color: var(--bubble-other-text); border-top-left-radius: 4px; max-width: 80%; border-radius: var(--radius-bubble); box-shadow: var(--shadow-sm); word-break: break-word;">
                                    ${bubble.content}
                                </div>
                            </div>
                        </div>
                    `;
                }
            });

            let choicesHTML = '';
            elements.filter(el => el.type === 'choice').forEach(choice => {
                const benefitsChar = choice.recommended_for_character_id;
                const recClass = benefitsChar ? 'recommended' : '';
                
                let recLabel = '';
                if (benefitsChar) {
                    const beneficiary = queryDB("SELECT name FROM characters WHERE id = :charId;", { ':charId': benefitsChar });
                    if (beneficiary.length > 0) {
                        recLabel = `<span class="choice-rec-tag" style="background-color: var(--success-border); color: white; font-size: 0.6rem; padding: 1px 4px; border-radius: 8px; font-weight: 600; float: right; text-transform: uppercase;">+${beneficiary[0].name}</span>`;
                    }
                }

                choicesHTML += `
                    <div class="choice-option ${recClass}" style="padding: 8px 10px; font-size: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-md); background-color: var(--bg-container); margin-bottom: 4px; cursor: pointer; transition: all 0.2s ease;">
                        ${recLabel}
                        ${choice.content}
                    </div>
                `;
            });

            const isPastHidden = (status === 'past' && !showPastChatrooms) ? 'display: none;' : '';

            $list.append(`
                <div class="live-chatroom ${status}" data-chat-id="${room.id}" style="${isPastHidden}">
                    <div class="live-chatroom-header">
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <div class="live-chatroom-title">${room.time} - ${room.title}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">${room.route}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="display: flex; gap: 2px; align-items: center;">
                                ${avatarsHTML}
                            </div>
                            <span class="status-badge ${status}">${badgeText}</span>
                        </div>
                    </div>
                    
                    <div class="live-chatroom-details">
                        <div class="chat-simulator-body" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; margin-top: 8px;">
                            ${chatHTML || '<div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No dialogue preview available.</div>'}
                        </div>
                        <div class="choices-container" style="margin-top: 8px; gap: 6px; display: flex; flex-direction: column;">
                            ${choicesHTML || '<div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No recommended choices guide needed.</div>'}
                        </div>
                    </div>
                </div>
            `);
        });

        // Update button text depending on showPastChatrooms state
        if (showPastChatrooms) {
            $('#toggle-past-chats-btn').text("Hide Past Chatrooms");
        } else {
            $('#toggle-past-chats-btn').text("Show Past Chatrooms");
        }
    }

    // Save Game Tracker Config
    $(document).on('click', '#save-tracker-config-btn', function() {
        const startDate = $('#tracker-start-date').val();
        const startTime = $('#tracker-start-time').val();
        const route = $('#tracker-route-select').val();

        if (!startDate || !startTime || route === 'none') {
            alert("Please fill in start date, start time, and select a route.");
            return;
        }

        const config = { startDate, startTime, route };
        localStorage.setItem('mysticdex_tracker_config', JSON.stringify(config));
        renderLiveSchedule(config);
    });

    // Edit Game Tracker Config
    $(document).on('click', '#edit-tracker-config-btn', function(e) {
        e.stopPropagation();
        showGameTrackerConfig();
    });

    // Toggle Past Chatrooms
    $(document).on('click', '#toggle-past-chats-btn', function(e) {
        e.stopPropagation();
        showPastChatrooms = !showPastChatrooms;
        
        const configStr = localStorage.getItem('mysticdex_tracker_config');
        if (configStr) {
            renderLiveSchedule(JSON.parse(configStr));
        }
    });

    // Toggle Live Chatroom accordion details
    $(document).on('click', '.live-chatroom', function() {
        $(this).toggleClass('expanded');
        $(this).find('.live-chatroom-details').slideToggle(200);
    });

    // Click handler for homepage quick cards
    $(document).on('click', '.feature-card.tracker-card', function() {
        $('.bottom-nav .nav-item[data-tab="tracker"]').trigger('click');
    });

});

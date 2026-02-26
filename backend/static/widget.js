(function () {
    if (window.SaikokuWidget) return;

    class ChatWidget {
        constructor() {
            this.config = {
                apiUrl: 'http://localhost:8000/api',
                agentId: null,
                model: 'gemini-2.5-flash-lite',
                serviceRAM: null,
                themeColor: '#00D1B2',
                title: 'AI Agent',
                displayMode: 'floating', // 'floating' | 'inline'
                containerId: null // Needed if displayMode is 'inline'
            };
            this.isOpen = false;
            this.messages = [];
            this.isLoading = false;
        }

        init(options = {}) {
            this.config = { ...this.config, ...options };
            this.createContainer();

            if (this.config.themeColor) {
                this.container.style.setProperty('--primary', this.config.themeColor);
            }
            if (this.config.title) {
                const titleEl = this.shadowRoot.querySelector('.chat-header-title');
                if (titleEl) titleEl.textContent = this.config.title;
            }
            console.log("Saikoku Chat Widget Initialized in " + this.config.displayMode + " mode.");
        }

        createContainer() {
            this.container = document.createElement('div');
            this.container.id = 'saikoku-chat-widget';
            this.container.style.setProperty('--primary', this.config.themeColor);

            this.shadowRoot = this.container.attachShadow({ mode: 'open' });

            // Inline CSS logic: floating mode is fixed to bottom-right, inline mode fills parent container.
            const isFloating = this.config.displayMode === 'floating';

            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        --primary: #00D1B2;
                        --primary-dark: #00a88f;
                        --bg-light: #ffffff;
                        --bg-gray: #f4f4f5;
                        --text-dark: #27272a;
                        --text-light: #71717a;
                        --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                        --border: #e4e4e7;
                        
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        
                        ${isFloating ? `
                        position: fixed;
                        bottom: 24px;
                        right: 24px;
                        z-index: 999999;
                        ` : `
                        display: block;
                        width: 100%;
                        height: 100%;
                        `}
                    }

                    * { box-sizing: border-box; }

                    /* Chat Window */
                    .chat-window {
                        background: var(--bg-light);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        border: 1px solid var(--border);
                        
                        ${isFloating ? `
                        position: absolute;
                        bottom: 80px;
                        right: 0;
                        width: 380px;
                        height: 600px;
                        max-height: calc(100vh - 120px);
                        border-radius: 16px;
                        box-shadow: var(--shadow);
                        transform-origin: bottom right;
                        transform: scale(0.9);
                        opacity: 0;
                        pointer-events: none;
                        transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                        ` : `
                        position: relative;
                        width: 100%;
                        height: 100%;
                        border-radius: 12px;
                        box-shadow: none;
                        opacity: 1;
                        transform: none;
                        pointer-events: auto;
                        `}
                    }
                    
                    ${isFloating ? `
                    .chat-window.open {
                        transform: scale(1);
                        opacity: 1;
                        pointer-events: auto;
                    }
                    ` : ``}

                    /* Header */
                    .chat-header {
                        padding: 16px 20px;
                        background: var(--bg-light);
                        border-bottom: 1px solid var(--border);
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    .chat-header-icon {
                        width: 32px;
                        height: 32px;
                        background: var(--primary);
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                    }
                    .chat-header-icon svg { width: 18px; height: 18px; }
                    .chat-header-title { font-weight: 600; color: var(--text-dark); font-size: 16px; }

                    /* Message Area */
                    .chat-messages {
                        flex: 1;
                        padding: 20px;
                        overflow-y: auto;
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                        background: #fcfcfc;
                    }
                    
                    .welcome-text { text-align: center; color: var(--text-light); font-size: 14px; margin-top: 20px; }

                    .message { max-width: 85%; font-size: 14px; line-height: 1.5; word-break: break-word; }
                    .message.user { align-self: flex-end; background: var(--primary); color: white; padding: 12px 16px; border-radius: 16px 16px 4px 16px; }
                    .message.assistant { align-self: flex-start; background: var(--bg-gray); color: var(--text-dark); padding: 12px 16px; border-radius: 16px 16px 16px 4px; border: 1px solid var(--border); }
                    .message.assistant p { margin: 0 0 10px 0; }
                    .message.assistant p:last-child { margin: 0; }

                    /* Loading Dots */
                    .typing-indicator {
                        display: none; align-self: flex-start; background: var(--bg-gray); padding: 14px 16px;
                        border-radius: 16px 16px 16px 4px; border: 1px solid var(--border); align-items: center; gap: 4px;
                    }
                    .typing-indicator.visible { display: flex; }
                    .dot { width: 6px; height: 6px; background: #a1a1aa; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; }
                    .dot:nth-child(1) { animation-delay: -0.32s; }
                    .dot:nth-child(2) { animation-delay: -0.16s; }
                    @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

                    /* Input Area */
                    .chat-input-area { padding: 16px; background: var(--bg-light); border-top: 1px solid var(--border); display: flex; gap: 12px; }
                    .chat-input {
                        flex: 1; border: 1px solid var(--border); border-radius: 20px; padding: 10px 16px;
                        font-size: 14px; outline: none; transition: border-color 0.2s; resize: none; max-height: 100px; font-family: inherit; background: var(--bg-gray);
                    }
                    .chat-input:focus { border-color: var(--primary); background: #fff; }
                    .chat-send {
                        width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: white; border: none; cursor: pointer; display: flex;
                        align-items: center; justify-content: center; transition: opacity 0.2s; flex-shrink: 0;
                    }
                    .chat-send:disabled { opacity: 0.5; cursor: not-allowed; }
                    .chat-send svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; margin-left: -2px; }
                    
                    ${isFloating ? `
                    .launcher {
                        width: 60px; height: 60px; border-radius: 50%; background-color: var(--primary); color: white;
                        display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: var(--shadow);
                        transition: transform 0.2s ease, background-color 0.2s; border: none; outline: none; position: absolute; bottom: 0; right: 0;
                    }
                    .launcher:hover { transform: scale(1.05); background-color: var(--primary-dark); }
                    .launcher svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 2; transition: transform 0.3s; }
                    .launcher.open svg { transform: rotate(90deg); }
                    @media (max-width: 480px) { .chat-window { width: calc(100vw - 32px); right: -8px; bottom: 74px; } }
                    ` : ``}
                </style>

                <div class="chat-window ${!isFloating ? 'open' : ''}">
                    <div class="chat-header">
                        <div class="chat-header-icon">
                            <svg viewBox="0 0 24 24"><path d="M12 2a2 2 0 0 1 2 2c-.001.373-.08.736-.23 1.071L15.636 7H18a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1v4a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-4H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2.364l1.866-1.929h.001A1.996 1.996 0 0 1 12 2zm0 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"></path></svg>
                        </div>
                        <div class="chat-header-title">AI Agent</div>
                    </div>
                    <div class="chat-messages" id="messages-container">
                        <div class="welcome-text">Ask me anything...</div>
                        <div class="typing-indicator" id="typing-indicator">
                            <div class="dot"></div><div class="dot"></div><div class="dot"></div>
                        </div>
                    </div>
                    <div class="chat-input-area">
                        <textarea class="chat-input" id="chat-input" rows="1" placeholder="Type a message..."></textarea>
                        <button class="chat-send" id="chat-send">
                            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>
                
                ${isFloating ? `
                <button class="launcher" id="launcher">
                    <svg viewBox="0 0 24 24" id="launcher-icon">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M8 9h8" /><path d="M8 13h6" />
                        <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z" />
                    </svg>
                </button>
                ` : ``}
            `;

            if (isFloating) {
                document.body.appendChild(this.container);
            } else {
                const target = document.getElementById(this.config.containerId);
                if (target) {
                    target.appendChild(this.container);
                } else {
                    console.error("Saikoku Widget Error: containerId not found:", this.config.containerId);
                }
            }
            this.bindEvents();
        }

        bindEvents() {
            const input = this.shadowRoot.getElementById('chat-input');
            const sendBtn = this.shadowRoot.getElementById('chat-send');

            if (this.config.displayMode === 'floating') {
                const launcher = this.shadowRoot.getElementById('launcher');
                const chatWindow = this.shadowRoot.querySelector('.chat-window');
                const launcherIcon = this.shadowRoot.getElementById('launcher-icon');

                launcher.addEventListener('click', () => {
                    this.isOpen = !this.isOpen;
                    chatWindow.classList.toggle('open', this.isOpen);
                    launcher.classList.toggle('open', this.isOpen);

                    if (this.isOpen) {
                        launcherIcon.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12" /><path d="M6 6l12 12" />';
                        setTimeout(() => input.focus(), 250);
                    } else {
                        launcherIcon.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 9h8" /><path d="M8 13h6" /><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z" />';
                    }
                });
            }

            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = (input.scrollHeight) + 'px';
                sendBtn.disabled = !input.value.trim();
            });

            // Track IME composition state (for Japanese/Chinese input)
            let isComposing = false;
            input.addEventListener('compositionstart', () => { isComposing = true; });
            input.addEventListener('compositionend', () => { isComposing = false; });

            input.addEventListener('keydown', (e) => {
                // If the user presses Shift+Enter, allow a newline.
                // If they press Enter without Shift, send the message (but only if not picking IME candidates).
                if (e.key === 'Enter' && !e.shiftKey) {
                    if (isComposing) {
                        // Still converting Japanese (pressing Enter to confirm characters) -> Do nothing.
                        return;
                    }
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        renderMessage(role, text) {
            const container = this.shadowRoot.getElementById('messages-container');
            const welcome = this.shadowRoot.querySelector('.welcome-text');
            if (welcome) welcome.remove();

            const msgDiv = document.createElement('div');
            // Fixed String Interpolation Issue
            msgDiv.className = 'message ' + role;

            if (role === 'assistant') {
                const formatted = text.replace(/\n/g, '<br>');
                msgDiv.innerHTML = formatted;
            } else {
                msgDiv.textContent = text;
            }

            const typingInd = this.shadowRoot.getElementById('typing-indicator');
            container.insertBefore(msgDiv, typingInd);
        }

        scrollToBottom() {
            const container = this.shadowRoot.getElementById('messages-container');
            container.scrollTop = container.scrollHeight;
        }

        async sendMessage() {
            if (this.isLoading) return;

            try {
                const input = this.shadowRoot.getElementById('chat-input');
                if (!input) { alert("Error: chat-input not found"); return; }

                const text = input.value.trim();

                if (!this.config.agentId) {
                    alert("Error: config.agentId is not set!");
                    return;
                }

                if (!text) {
                    return;
                }

                input.value = '';
                input.style.height = 'auto';
                input.focus();

                this.renderMessage('user', text);
                this.scrollToBottom();

                this.messages.push({ role: 'user', content: text });

                this.isLoading = true;
                this.shadowRoot.getElementById('typing-indicator').classList.add('visible');
                this.shadowRoot.getElementById('chat-send').disabled = true;
                this.scrollToBottom();

                const historyToSend = this.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));

                const payload = {
                    agent_id: this.config.agentId,
                    message: text,
                    model: this.config.model,
                    history: historyToSend,
                    service_ram: this.config.serviceRAM
                };

                const res = await fetch(this.config.apiUrl + '/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) throw new Error('API Error: ' + res.statusText);

                const data = await res.json();

                this.messages.push({ role: 'assistant', content: data.response });
                this.renderMessage('assistant', data.response);

            } catch (err) {
                console.error(err);
                alert("SendMessage JS Error: " + err.message);
                this.renderMessage('assistant', 'Error connecting to the AI agent.');
            } finally {
                this.isLoading = false;
                const typingInd = this.shadowRoot.getElementById('typing-indicator');
                if (typingInd) typingInd.classList.remove('visible');

                const chatSendBtn = this.shadowRoot.getElementById('chat-send');
                if (chatSendBtn) chatSendBtn.disabled = false;
            }
        }
    }

    if (!window.SaikokuWidget) {
        window.SaikokuWidget = new ChatWidget();
    }
})();

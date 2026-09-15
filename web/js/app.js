/**
 * Main Application Logic for Gas & Fire Warning Dashboard
 * Integrates with Firebase Realtime Database SSE / REST API
 */

class DashboardApp {
    constructor() {
        this.config = window.SYSTEM_CONFIG;
        this.chart = null;
        this.chartData = {
            labels: [],
            values: []
        };
        this.eventSource = null;
        this.pollTimer = null;
        this.heartbeatTimer = null;
        this.demoTimer = null;
        this.lastPacketTimestamp = null;
        this.packetCount = 0;
        this.stats = {
            min: null,
            max: null,
            sum: 0,
            count: 0
        };

        this.init();
    }

    init() {
        this.initChart();
        this.setupEventListeners();
        this.startHeartbeatMonitor();

        if (this.config.demoMode) {
            this.startDemoMode();
        } else {
            this.connectFirebase();
        }
    }

    /* ----------------------------------------------------
     * Chart Initialization (Chart.js)
     * ---------------------------------------------------- */
    initChart() {
        const ctx = document.getElementById('ppmChart').getContext('2d');
        
        // Gradient fill for line chart
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
        gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.chartData.labels,
                datasets: [{
                    label: 'Nồng độ Khí Gas (PPM)',
                    data: this.chartData.values,
                    borderColor: '#06b6d4',
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointBackgroundColor: '#0891b2',
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 400
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'JetBrains Mono', size: 10 },
                            maxRotation: 0
                        }
                    },
                    y: {
                        min: 0,
                        suggestedMax: 200,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'JetBrains Mono', size: 10 }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleFont: { family: 'JetBrains Mono', size: 12 },
                        bodyFont: { family: 'Inter', size: 12 },
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: (context) => `Khí Gas: ${context.parsed.y} PPM`
                        }
                    }
                }
            }
        });
    }

    /* ----------------------------------------------------
     * Firebase Connection (SSE Stream + Polling Fallback)
     * ---------------------------------------------------- */
    connectFirebase() {
        this.updateFirebaseStatus('connecting', 'Đang kết nối Firebase...');

        let baseUrl = this.config.databaseUrl.trim().replace(/\/+$/, '');
        let path = this.config.dataPath.trim().replace(/^\/+|\/+$/g, '');
        let sseUrl = `${baseUrl}/${path}.json`;

        if (this.eventSource) {
            this.eventSource.close();
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }

        try {
            // Use Firebase Server-Sent Events (SSE) for zero-latency real-time streaming
            this.eventSource = new EventSource(sseUrl);

            this.eventSource.addEventListener('put', (e) => {
                try {
                    const parsed = JSON.parse(e.data);
                    if (parsed && parsed.data !== undefined) {
                        this.handleIncomingData(parsed.data);
                    }
                } catch (err) {
                    console.error('Error parsing SSE put data:', err);
                }
            });

            this.eventSource.addEventListener('patch', (e) => {
                try {
                    const parsed = JSON.parse(e.data);
                    if (parsed && parsed.data) {
                        this.handleIncomingData(parsed.data);
                    }
                } catch (err) {
                    console.error('Error parsing SSE patch data:', err);
                }
            });

            this.eventSource.onopen = () => {
                this.updateFirebaseStatus('connected', 'Firebase Realtime: OK');
            };

            this.eventSource.onerror = (err) => {
                console.warn('SSE connection issue, falling back to polling...', err);
                this.updateFirebaseStatus('error', 'Chuyển sang chế độ Polling');
                this.eventSource.close();
                this.startPollingFallback(sseUrl);
            };

        } catch (error) {
            console.error('Failed to create EventSource:', error);
            this.startPollingFallback(sseUrl);
        }
    }

    startPollingFallback(url) {
        if (this.pollTimer) clearInterval(this.pollTimer);

        const fetchData = async () => {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data) {
                        this.updateFirebaseStatus('connected', 'Firebase (Polling 2s)');
                        this.handleIncomingData(data);
                    }
                } else {
                    this.updateFirebaseStatus('error', `Lỗi HTTP ${res.status}`);
                }
            } catch (err) {
                this.updateFirebaseStatus('error', 'Mất kết nối');
            }
        };

        fetchData();
        this.pollTimer = setInterval(fetchData, this.config.updateIntervalMs);
    }

    updateFirebaseStatus(state, text) {
        const badge = document.getElementById('firebase-status-badge');
        const icon = document.getElementById('firebase-icon');
        const textEl = document.getElementById('firebase-status-text');

        textEl.textContent = text;
        if (state === 'connected') {
            icon.className = 'fa-solid fa-cloud-bolt text-emerald-400';
            badge.className = 'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-300';
        } else if (state === 'connecting') {
            icon.className = 'fa-solid fa-spinner fa-spin text-amber-400';
            badge.className = 'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-xs text-slate-300';
        } else {
            icon.className = 'fa-solid fa-circle-exclamation text-rose-400';
            badge.className = 'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300';
        }
    }

    /* ----------------------------------------------------
     * Data Processing & UI State Dispatcher
     * ---------------------------------------------------- */
    handleIncomingData(raw) {
        if (!raw || typeof raw !== 'object') return;

        this.packetCount++;
        this.lastPacketTimestamp = Date.now();

        // Normalizing data fields (tolerant to different naming)
        const ppm = Math.max(0, parseInt(raw.ppm !== undefined ? raw.ppm : (raw.gas_ppm || raw.value || 0), 10));
        const moduleStatus = (raw.status || raw.sim_status || raw.module_status || 'NOT CALL').toUpperCase();
        const buzzerState = raw.buzzer === 1 || raw.buzzer === true || raw.buzzer === '1' || raw.buzzer === 'ON';
        const muteState = raw.mute === 1 || raw.mute === true || raw.mute === '1' || raw.mute === 'MUTED' || raw.false_alarm === true;
        const smsStatus = raw.sms_status || (ppm >= this.config.thresholds.warningPpm ? 'Đã gửi SMS cảnh báo' : 'Chưa gửi');
        const targetPhone = raw.phone || raw.target_phone || '0987654321';
        const rawAdc = raw.adc !== undefined ? raw.adc : (raw.raw_adc || Math.round(ppm * 13.5));

        // Update UI Components
        this.updatePpmDisplay(ppm, rawAdc);
        this.updateSimModuleDisplay(moduleStatus, smsStatus, targetPhone);
        this.updateBuzzerMuteDisplay(buzzerState, muteState);
        this.updateLcdPreview(ppm, moduleStatus, buzzerState, muteState);
        this.updateStatsAndChart(ppm);
        this.updatePacketCount();
        this.evaluateAlertBanner(ppm, moduleStatus, buzzerState, muteState);
        this.appendLogEntry(ppm, moduleStatus, buzzerState, muteState, raw.msg || raw.event);
    }

    /* ----------------------------------------------------
     * UI Renderers
     * ---------------------------------------------------- */
    updatePpmDisplay(ppm, rawAdc) {
        const valPpm = document.getElementById('val-ppm');
        const ppmBar = document.getElementById('ppm-bar');
        const thresholdBadge = document.getElementById('ppm-threshold-badge');
        const valAdc = document.getElementById('val-raw-adc');

        valPpm.textContent = ppm;
        valAdc.textContent = `ADC: ${rawAdc}`;

        // Percentage for bar (capped at 300 PPM)
        const percent = Math.min(100, Math.max(2, (ppm / 300) * 100));
        ppmBar.style.width = `${percent}%`;

        if (ppm >= this.config.thresholds.dangerPpm) {
            valPpm.className = 'text-5xl font-black font-[\'JetBrains_Mono\'] tracking-tight text-red-500 glow-red animate-pulse';
            ppmBar.className = 'bg-red-500 h-1.5 rounded-full transition-all duration-500 shadow-lg shadow-red-500/50';
            thresholdBadge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30';
            thresholdBadge.textContent = 'NGUY HIỂM (CẤP 2)';
        } else if (ppm >= this.config.thresholds.warningPpm) {
            valPpm.className = 'text-5xl font-black font-[\'JetBrains_Mono\'] tracking-tight text-amber-400 glow-amber';
            ppmBar.className = 'bg-amber-400 h-1.5 rounded-full transition-all duration-500 shadow-lg shadow-amber-500/50';
            thresholdBadge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30';
            thresholdBadge.textContent = 'CẢNH BÁO (CẤP 1)';
        } else {
            valPpm.className = 'text-5xl font-black font-[\'JetBrains_Mono\'] tracking-tight text-emerald-400 glow-cyan';
            ppmBar.className = 'bg-emerald-500 h-1.5 rounded-full transition-all duration-500';
            thresholdBadge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
            thresholdBadge.textContent = 'AN TOÀN';
        }
    }

    updateSimModuleDisplay(status, smsStatus, targetPhone) {
        const valStatus = document.getElementById('val-module-status');
        const iconBox = document.getElementById('sim-status-icon-box');
        const icon = document.getElementById('sim-status-icon');
        const smsEl = document.getElementById('val-sms-status');
        const phoneEl = document.getElementById('val-target-phone');

        valStatus.textContent = status;
        smsEl.textContent = smsStatus;
        phoneEl.textContent = targetPhone;

        if (status.includes('IN CALL') || status === 'CALLING') {
            iconBox.className = 'w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-xl text-red-400 animate-call-active';
            icon.className = 'fa-solid fa-phone-volume';
            valStatus.className = 'text-xl font-bold font-[\'JetBrains_Mono\'] text-red-400 animate-pulse';
        } else if (status.includes('SMS')) {
            iconBox.className = 'w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl text-amber-400';
            icon.className = 'fa-solid fa-comment-sms';
            valStatus.className = 'text-xl font-bold font-[\'JetBrains_Mono\'] text-amber-400';
        } else {
            iconBox.className = 'w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl text-slate-400';
            icon.className = 'fa-solid fa-phone-slash';
            valStatus.className = 'text-xl font-bold font-[\'JetBrains_Mono\'] text-white';
        }
    }

    updateBuzzerMuteDisplay(buzzerState, muteState) {
        const buzzerBadge = document.getElementById('buzzer-state-badge');
        const buzzerIconBg = document.getElementById('buzzer-icon-bg');
        const buzzerIcon = document.getElementById('buzzer-icon');
        const valBuzzerText = document.getElementById('val-buzzer-text');
        const buzzerPulse = document.getElementById('buzzer-pulse');

        const muteIconBg = document.getElementById('mute-icon-bg');
        const valMuteText = document.getElementById('val-mute-text');
        const valMutePill = document.getElementById('val-mute-pill');

        if (buzzerState) {
            buzzerBadge.textContent = 'ON (ĐANG KÊU)';
            buzzerBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse';
            buzzerIconBg.className = 'w-8 h-8 rounded-lg bg-red-500/20 text-red-400';
            buzzerIcon.className = 'fa-solid fa-volume-high text-red-400';
            valBuzzerText.textContent = 'KÊU LIÊN TỤC';
            valBuzzerText.className = 'text-sm font-bold text-red-400';
            buzzerPulse.className = 'w-3 h-3 rounded-full bg-red-500 animate-ping';
        } else {
            buzzerBadge.textContent = 'OFF';
            buzzerBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700';
            buzzerIconBg.className = 'w-8 h-8 rounded-lg bg-slate-800 text-slate-400';
            buzzerIcon.className = 'fa-solid fa-volume-xmark';
            valBuzzerText.textContent = 'Đang tắt';
            valBuzzerText.className = 'text-sm font-bold text-slate-200';
            buzzerPulse.className = 'w-3 h-3 rounded-full bg-slate-600';
        }

        if (muteState) {
            muteIconBg.className = 'w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400';
            valMuteText.textContent = 'ĐÃ TẮT CẢNH BÁO';
            valMuteText.className = 'text-sm font-bold text-purple-400';
            valMutePill.className = 'text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono font-bold';
            valMutePill.textContent = 'MUTED';
        } else {
            muteIconBg.className = 'w-8 h-8 rounded-lg bg-slate-800 text-slate-400';
            valMuteText.textContent = 'Bình thường';
            valMuteText.className = 'text-sm font-bold text-slate-200';
            valMutePill.className = 'text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono';
            valMutePill.textContent = 'READY';
        }
    }

    updateLcdPreview(ppm, status, buzzer, mute) {
        document.getElementById('lcd-line-1').textContent = 'GAS ALERT SYSTEM';
        let condStr = ppm >= 150 ? '[DANGER]' : (ppm >= 136 ? '[WARN]' : '[SAFE]');
        document.getElementById('lcd-line-2').textContent = `PPM: ${ppm.toString().padEnd(4)} ${condStr}`;
        document.getElementById('lcd-line-3').textContent = `SIM: ${status.substring(0, 14)}`;
        document.getElementById('lcd-line-4').textContent = `BUZZ:${buzzer ? 'ON ' : 'OFF'} MUT:${mute ? 'YES' : 'NO'}`;
    }

    evaluateAlertBanner(ppm, status, buzzer, mute) {
        const banner = document.getElementById('alert-banner');
        const icon = document.getElementById('alert-banner-icon');
        const title = document.getElementById('alert-banner-title');
        const desc = document.getElementById('alert-banner-desc');
        const badge = document.getElementById('alert-banner-badge');

        if (ppm >= this.config.thresholds.dangerPpm) {
            banner.classList.remove('hidden');
            banner.className = 'rounded-xl border p-4 bg-red-950/40 border-red-600/60 text-red-100 flex items-start sm:items-center justify-between gap-4 animate-pulse';
            icon.className = 'w-10 h-10 rounded-lg bg-red-600/30 text-red-400 flex items-center justify-center text-xl flex-shrink-0';
            title.textContent = 'NGUY HIỂM CẤP 2: PHÁT HIỆN RÒ RỈ KHÍ GAS MỨC ĐỘ CAO!';
            desc.textContent = `Nồng độ hiện tại ${ppm} PPM (>= 150 PPM). Module SIM800L đang phát cuộc gọi khẩn cấp & còi hú tối đa.`;
            badge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-red-600 text-white';
            badge.textContent = 'IN CALL - DANGER';
        } else if (ppm >= this.config.thresholds.warningPpm) {
            banner.classList.remove('hidden');
            banner.className = 'rounded-xl border p-4 bg-amber-950/40 border-amber-600/60 text-amber-100 flex items-start sm:items-center justify-between gap-4';
            icon.className = 'w-10 h-10 rounded-lg bg-amber-600/30 text-amber-400 flex items-center justify-center text-xl flex-shrink-0';
            title.textContent = 'CẢNH BÁO CẤP 1: VƯỢT NGƯỠNG KHÍ GAS TIÊU CHUẨN';
            desc.textContent = `Nồng độ hiện tại ${ppm} PPM (>= 136 PPM). Hệ thống đã kích hoạt còi báo và gửi tin nhắn SMS cảnh báo.`;
            badge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-amber-600 text-white';
            badge.textContent = 'SMS - WARNING';
        } else {
            banner.classList.add('hidden');
        }
    }

    updateStatsAndChart(ppm) {
        const now = new Date();
        const timeLabel = now.toTimeString().split(' ')[0];

        // Append to chart dataset
        this.chartData.labels.push(timeLabel);
        this.chartData.values.push(ppm);

        if (this.chartData.labels.length > this.config.maxChartPoints) {
            this.chartData.labels.shift();
            this.chartData.values.shift();
        }
        this.chart.update('none');

        // Calculate Min, Max, Avg
        if (this.stats.min === null || ppm < this.stats.min) this.stats.min = ppm;
        if (this.stats.max === null || ppm > this.stats.max) this.stats.max = ppm;
        this.stats.sum += ppm;
        this.stats.count++;

        const avg = Math.round(this.stats.sum / this.stats.count);

        document.getElementById('val-min-ppm').textContent = `${this.stats.min} PPM`;
        document.getElementById('val-avg-ppm').textContent = `${avg} PPM`;
        document.getElementById('val-max-ppm').textContent = `${this.stats.max} PPM`;
    }

    updatePacketCount() {
        document.getElementById('val-packet-count').textContent = `${this.packetCount} bản tin`;
    }

    appendLogEntry(ppm, status, buzzer, mute, customMsg) {
        const tbody = document.getElementById('logs-table-body');
        
        // Remove empty state placeholder
        if (this.packetCount === 1) {
            tbody.innerHTML = '';
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN');

        let rowClass = 'hover:bg-slate-800/40 transition';
        let ppmClass = 'text-slate-300 font-bold';
        let desc = customMsg || 'Cập nhật định kỳ';

        if (ppm >= this.config.thresholds.dangerPpm) {
            ppmClass = 'text-red-400 font-bold';
            desc = '🚨 Nguy hiểm cấp 2: Vượt ngưỡng 150 PPM, gọi điện khẩn cấp!';
        } else if (ppm >= this.config.thresholds.warningPpm) {
            ppmClass = 'text-amber-400 font-bold';
            desc = '⚠️ Cảnh báo cấp 1: Vượt ngưỡng 136 PPM, gửi tin nhắn SMS!';
        }

        if (mute) {
            desc += ' [Nút Mute kích hoạt]';
        }

        const tr = document.createElement('tr');
        tr.className = rowClass;
        tr.innerHTML = `
            <td class="px-4 py-2.5 text-slate-400">${timeStr}</td>
            <td class="px-4 py-2.5 ${ppmClass}">${ppm} PPM</td>
            <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${status.includes('CALL') ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-slate-800 text-slate-300'}">
                    ${status}
                </span>
            </td>
            <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${buzzer ? 'bg-red-950 text-red-300' : 'bg-slate-800 text-slate-400'}">
                    ${buzzer ? 'ON' : 'OFF'}
                </span>
            </td>
            <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded text-[11px] ${mute ? 'bg-purple-950 text-purple-300' : 'text-slate-500'}">
                    ${mute ? 'MUTED' : 'NORMAL'}
                </span>
            </td>
            <td class="px-4 py-2.5 text-slate-300">${desc}</td>
        `;

        tbody.insertBefore(tr, tbody.firstChild);

        // Keep maximum rows
        while (tbody.children.length > this.config.maxLogRows) {
            tbody.removeChild(tbody.lastChild);
        }
    }

    /* ----------------------------------------------------
     * Heartbeat & Liveness Tracker
     * ---------------------------------------------------- */
    startHeartbeatMonitor() {
        this.heartbeatTimer = setInterval(() => {
            const updatedEl = document.getElementById('val-last-updated');
            const dotEl = document.getElementById('device-pulse-dot');
            const statusTextEl = document.getElementById('device-status-text');

            if (!this.lastPacketTimestamp) {
                updatedEl.textContent = 'Chưa có dữ liệu';
                return;
            }

            const diffSec = Math.floor((Date.now() - this.lastPacketTimestamp) / 1000);
            if (diffSec < 3) {
                updatedEl.textContent = 'Vừa xong';
            } else {
                updatedEl.textContent = `${diffSec} giây trước`;
            }

            // If no data received for > 15 seconds, mark device as offline
            if (diffSec > 15) {
                dotEl.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
                statusTextEl.textContent = 'ESP32: Offline';
            } else {
                dotEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
                statusTextEl.textContent = 'ESP32: Online';
            }
        }, 1000);
    }

    /* ----------------------------------------------------
     * Offline Demo Simulator Mode
     * ---------------------------------------------------- */
    startDemoMode() {
        this.updateFirebaseStatus('connected', 'Demo Simulator Mode');
        console.log('Demo mode active: generating synthetic sensor telemetry');

        let currentPpm = 75;
        let trend = 1;

        this.demoTimer = setInterval(() => {
            // Fluctuate PPM smoothly
            if (Math.random() > 0.85) {
                trend = -trend;
            }
            let step = Math.floor(Math.random() * 8) + 1;
            currentPpm += step * trend;

            // Occasional spike above 136 and 150 for demonstration
            if (Math.random() > 0.90) {
                currentPpm = 140 + Math.floor(Math.random() * 25);
            }

            if (currentPpm < 30) currentPpm = 35;
            if (currentPpm > 185) currentPpm = 175;

            let status = 'NOT CALL';
            let buzzer = false;
            let mute = false;

            if (currentPpm >= 150) {
                status = 'IN CALL';
                buzzer = true;
            } else if (currentPpm >= 136) {
                status = 'SMS SENT';
                buzzer = true;
            }

            this.handleIncomingData({
                ppm: currentPpm,
                status: status,
                buzzer: buzzer,
                mute: mute,
                phone: '+84987654321',
                adc: Math.round(currentPpm * 13.5),
                event: 'Mô phỏng dữ liệu sensor test'
            });
        }, 2000);
    }

    /* ----------------------------------------------------
     * Event Listeners
     * ---------------------------------------------------- */
    setupEventListeners() {
        const btnClearChart = document.getElementById('btn-clear-chart');
        const btnClearLogs = document.getElementById('btn-clear-logs');

        if (btnClearChart) {
            btnClearChart.addEventListener('click', () => {
                this.chartData.labels = [];
                this.chartData.values = [];
                this.stats = { min: null, max: null, sum: 0, count: 0 };
                this.chart.update();
                document.getElementById('val-min-ppm').textContent = '0 PPM';
                document.getElementById('val-avg-ppm').textContent = '0 PPM';
                document.getElementById('val-max-ppm').textContent = '0 PPM';
            });
        }

        if (btnClearLogs) {
            btnClearLogs.addEventListener('click', () => {
                document.getElementById('logs-table-body').innerHTML = `
                    <tr class="text-slate-500 text-center">
                        <td colspan="6" class="py-6">Đã xóa nhật ký. Đang chờ dữ liệu mới...</td>
                    </tr>
                `;
            });
        }
    }
}

// Instantiate dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DashboardApp();
});

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initEngineeringSimulation();
});

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-links li');
    const modules = document.querySelectorAll('.module');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            modules.forEach(m => m.classList.remove('active'));
            const targetId = link.getAttribute('data-target');
            const targetModule = document.getElementById(targetId);
            if (targetModule) {
                targetModule.classList.add('active');
            }
        });
    });
}

function initEngineeringSimulation() {
    // Controls
    const btnNext = document.getElementById('btn-next');
    const btnPrev = document.getElementById('btn-prev');
    const btnPlay = document.getElementById('btn-play');

    // Status Elements
    const valVCC = document.getElementById('val-vcc');
    const val1V8 = document.getElementById('val-1v8');
    const valClk = document.getElementById('val-clk');
    const valPC = document.getElementById('val-pc');
    const rcPhy = document.getElementById('rc-phy');
    const ltssmState = document.getElementById('ltssm-state');
    const linkSpeed = document.getElementById('link-speed');
    const logContainer = document.getElementById('sim-log');

    // Inspector Elements
    const inspectorPanel = document.getElementById('reg-inspector');
    const inspName = document.getElementById('insp-name');
    const inspAddr = document.getElementById('insp-addr');
    const inspBits = document.getElementById('insp-bits');
    const inspDesc = document.getElementById('insp-desc');

    // Components
    const socBox = document.querySelector('.soc-box');
    const core0 = document.getElementById('core-0');
    const bootRom = document.getElementById('boot-rom');
    const sramBlk = document.getElementById('sram-blk');
    const pcieLink = document.getElementById('pcie-link');
    const nvmeCtrl = document.getElementById('nvme-ctrl');

    let currentStep = 0;
    let autoPlayTimer = null;

    // Helper: Logging
    function log(msg, type = 'info') {
        // De-highlight old logs
        document.querySelectorAll('.log-line.active-log').forEach(el => el.classList.remove('active-log'));

        const line = document.createElement('span');
        line.className = `log-line ${type} active-log`; // New line is active
        line.innerText = `[${new Date().toLocaleTimeString().split(' ')[0]}] ${msg}`;
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // Helper: Register Inspector
    function showRegister(name, addr, desc, bits) {
        inspectorPanel.style.display = 'block';
        inspName.innerText = name;
        inspAddr.innerText = addr;
        inspDesc.innerText = desc;
        inspBits.innerHTML = '';

        bits.forEach(bit => {
            const div = document.createElement('div');
            div.className = `bit-field ${bit.active ? 'active' : ''}`;
            div.style.flex = bit.width || 1;
            div.innerHTML = `
                <span class="bit-label">${bit.label}</span>
                <span class="bit-val">${bit.val}</span>
            `;
            inspBits.appendChild(div);
        });
    }

    function hideRegister() {
        inspectorPanel.style.display = 'none';
    }

    // Helper: Animate TLP Token
    function sendTLP(fromRect, toRect, label, color = 'var(--accent-green)') {
        const packet = document.createElement('div');
        packet.className = 'tlp-packet';
        packet.innerText = label;
        packet.style.background = color;

        const grid = document.querySelector('.schematic-grid');
        grid.appendChild(packet);

        const isRead = label.includes("MemRd") || label.includes("BPINFO");

        // Coordinates (Approximate for grid layout)
        const startLeft = isRead ? "20%" : "60%";
        const endLeft = isRead ? "60%" : "20%";

        packet.style.left = startLeft;
        packet.style.top = "50%"; // Center vertically relative to grid

        packet.animate([
            { left: startLeft, opacity: 1 },
            { left: endLeft, opacity: 0 }
        ], {
            duration: 900,
            easing: 'ease-in-out'
        });

        setTimeout(() => packet.remove(), 900);
    }

    // --- 17-Step Boot Sequence ---
    const scenarios = {
        standard: [
            {
                name: "OFF",
                action: () => {
                    valVCC.innerText = "0.0V";
                    val1V8.innerText = "0.0V";
                    valClk.innerText = "OFF";
                    valPC.innerText = "----";
                    rcPhy.innerText = "PHY: Down";
                    resetVisuals();
                    hideRegister();
                    log("System Power OFF. Waiting for POR...");
                }
            },
            {
                name: "POR (Power On Reset)",
                action: () => {
                    valVCC.innerText = "3.3V";
                    val1V8.innerText = "1.8V";
                    log("PMIC: Voltage Rails Stabilized.", "success");
                }
            },
            {
                name: "Reset Vector Catch",
                action: () => {
                    valClk.innerText = "100MHz";
                    valPC.innerText = "0xFFFF_0000";
                    bootRom.classList.add('active'); // Highlight BootROM
                    log("CPU: Reset Vector Reached. Executing BootROM.", "info");
                }
            },
            {
                name: "Internal SRAM Zeroing",
                action: () => {
                    valPC.innerText = "0xFFFF_0020";
                    sramBlk.innerText = "0x00...00";
                    sramBlk.classList.add('highlight');
                    log("BootROM: Zeroing Internal SRAM (ECC Init).", "info");
                }
            },
            {
                name: "PCIe Clock Enable",
                action: () => {
                    log("BootROM: Enabling PCIe Root Complex Clocks...");
                    rcPhy.innerText = "PHY: RESET";
                }
            },
            {
                name: "PCIe Link Training (LTSSM)",
                action: () => {
                    rcPhy.innerText = "PHY: DETECT";
                    log("PCIe: LTSSM State Machine Started.", "warn");

                    let states = ["POLLING", "CONFIG", "L0"];
                    let i = 0;
                    let trainInterval = setInterval(() => {
                        if (i >= states.length) {
                            clearInterval(trainInterval);
                            return;
                        }
                        rcPhy.innerText = `PHY: ${states[i]}`;
                        ltssmState.innerText = states[i];
                        if (states[i] === "L0") {
                            pcieLink.classList.add('active');
                            linkSpeed.innerText = "Gen4 x4";
                            log("PCIe: Link Up @ Gen4 x4 (16GT/s).", "success");
                        }
                        i++;
                    }, 400);
                }
            },
            {
                name: "NVMe Discovery (VS/CAP)",
                action: () => {
                    sendTLP(null, null, "MemRd: VS/CAP");
                    document.getElementById('reg-vs').classList.add('read-active');

                    showRegister("VS (Version)", "0x08", "Indicates NVMe Spec Support", [
                        { label: "MJR", val: "2", width: 1, active: true },
                        { label: "MNR", val: "0", width: 1 },
                        { label: "TER", val: "0", width: 1 }
                    ]);

                    log("Host: Read VS Register -> NVMe 2.0 Detected.", "info");
                }
            },
            {
                name: "BPInfo Read",
                action: () => {
                    document.getElementById('reg-bpinfo').classList.add('read-active');

                    showRegister("BPINFO", "0x40", "Boot Partition Information", [
                        { label: "BPSZ (Size)", val: "128KB", width: 2, active: true },
                        { label: "BRS (Read Status)", val: "0", width: 1 },
                        { label: "ABPID (Active BP)", val: "1", width: 1, active: true }
                    ]);

                    log("Host: BPINFO Read. Active BP is ID=1 (Size 128KB).", "info");
                }
            },
            {
                name: "BP Select (BPRSEL)",
                action: () => {
                    document.getElementById('reg-bprsel').classList.add('read-active');

                    showRegister("BPRSEL", "0x44", "Boot Partition Read Select", [
                        { label: "BPID", val: "1", width: 1, active: true },
                        { label: "BPROffset", val: "0x0", width: 2 },
                        { label: "BPRSz", val: "128KB", width: 2 }
                    ]);

                    log("Host: Writing BPRSEL -> Selecting BP1 for Read.", "warn");
                }
            },
            {
                name: "BP Read Stream (Sideband)",
                action: () => {
                    log("Host: Initiating Sideband Read (No Queues)...", "info");
                    document.getElementById('part-bp1').classList.add('reading');
                    hideRegister();

                    let packetCount = 0;
                    let stream = setInterval(() => {
                        sendTLP(null, null, "CplD (Data)", "var(--accent-orange)");
                        packetCount++;
                        if (packetCount > 4) {
                            clearInterval(stream);
                            sramBlk.innerText = "BL1 Image";
                            sramBlk.classList.add('filled');
                            log("SoC: 128KB copied to Internal SRAM.", "success");
                        }
                    }, 250);
                }
            },
            {
                name: "Signature Verification",
                action: () => {
                    valPC.innerText = "0xFFFF_0040"; // Some ROM routine
                    log("BootROM: Verifying BL1 Header Signature...", "warn");
                }
            },
            {
                name: "Execute BL1",
                action: () => {
                    valPC.innerText = "0x0000_1000"; // SRAM Base
                    core0.classList.add('active'); // Core executes code
                    bootRom.classList.remove('active');
                    sramBlk.classList.add('active');
                    log("SoC: Jump to SRAM (0x1000). Executing BL1.", "success");
                }
            },
            {
                name: "DRAM Training",
                action: () => {
                    log("BL1: Initializing DDR4 Controller...", "info");
                    const dramBox = document.querySelector('.dram-box');

                    // Start Training Visual
                    dramBox.classList.remove('uninit');
                    dramBox.classList.add('training');

                    setTimeout(() => {
                        dramBox.classList.remove('training');
                        dramBox.classList.add('initialized');
                        document.getElementById('dram-reserved').classList.add('filled');
                        log("BL1: DRAM Training Complete. 4GB Available.", "success");
                    }, 1000);
                }
            },
            {
                name: "NVMe Driver Init (CC.EN)",
                action: () => {
                    document.getElementById('reg-cc').classList.add('read-active');

                    showRegister("CC", "0x14", "Controller Configuration", [
                        { label: "EN (Enable)", val: "1", width: 1, active: true },
                        { label: "CSS (Cmd Set)", val: "NVM", width: 2 },
                        { label: "MPS (Page Sz)", val: "4K", width: 1 }
                    ]);

                    nvmeCtrl.classList.add('active');
                    log("BL1: Writing CC.EN=1. Controller Enabled.", "warn");
                }
            },
            {
                name: "Namespace Identify",
                action: () => {
                    hideRegister();
                    log("BL1: Admin Queue Created. Sending Identify Namespace (NSID=1).", "info");
                    sendTLP(null, null, "CMD: Identify");
                }
            },
            {
                name: "OS Load (High Speed)",
                action: () => {
                    log("BL1: Loading OS Kernel (Linux) from NSID 1...", "info");
                    document.getElementById('part-user').classList.add('reading');

                    let packetCount = 0;
                    let stream = setInterval(() => {
                        sendTLP(null, null, "Page Data", "#fff");
                        packetCount++;
                        if (packetCount > 6) {
                            clearInterval(stream);
                            document.getElementById('dram-os').classList.add('filled');
                            log("OS: Kernel Image Loaded to 0x8000_0000.", "success");
                        }
                    }, 150); // Faster
                }
            },
            {
                name: "Kernel Execution",
                action: () => {
                    valPC.innerText = "0x8000_0000";
                    core0.classList.add('active');
                    // Move highlight from SRAM to DRAM
                    sramBlk.classList.remove('active');
                    document.getElementById('dram-os').classList.add('filled');
                    log("BL1: Jump to 0x8000_0000. Linux Kernel Starting...", "success");
                }
            }
        ],
        tc1: [
            { name: "INIT", action: () => { resetVisuals(); log("TC-01: Discovery Compliance Test Started."); } },
            {
                name: "VS Check", action: () => {
                    sendTLP(null, null, "Rd: VS");
                    showRegister("VS", "0x08", "Version", [{ label: "MJR", val: "2", active: true }, { label: "MNR", val: "0" }]);
                    log("TEST: Version is 2.0. Proceeding.", "success");
                }
            },
            {
                name: "CAP Check", action: () => {
                    sendTLP(null, null, "Rd: CAP");
                    showRegister("CAP", "0x00", "Capabilities", [
                        { label: "TO", val: "50ms" },
                        { label: "BPS (Bit 45)", val: "1", active: true, width: 2 }
                    ]);
                    log("TEST: CAP.BPS = 1. Controller supports BP.", "success");
                }
            },
            {
                name: "BPINFO Check", action: () => {
                    sendTLP(null, null, "Rd: BPINFO");
                    showRegister("BPINFO", "0x40", "BP Information", [
                        { label: "BPSZ", val: "128KB", active: true },
                        { label: "ABPID", val: "1", active: true }
                    ]);
                    log("TEST: Active BP ID=1, Size=128KB. Discovery PASS.", "success");
                }
            }
        ],
        tc2: [
            { name: "INIT", action: () => { resetVisuals(); log("TC-02: Sideband Read (No Admin Queue) Test."); } },
            {
                name: "Verify CC.EN=0", action: () => {
                    showRegister("CC", "0x14", "Ctrl Config", [
                        { label: "EN", val: "0", active: true, width: 1 } // Highlight 0
                    ]);
                    log("TEST: Controller is DISABLED (CC.EN=0). Correct.", "info");
                }
            },
            {
                name: "Write BPRSEL", action: () => {
                    showRegister("BPRSEL", "0x44", "Trigger Read", [
                        { label: "BPID", val: "1", active: true }, { label: "Offset", val: "0x0" }
                    ]);
                    log("TEST: Writing BPRSEL (BPID=1, Off=0) via MMIO.", "warn");
                }
            },
            {
                name: "Check Busy Status", action: () => {
                    showRegister("BPINFO", "0x40", "Status Check", [
                        { label: "BRS", val: "1 (Busy)", active: true, width: 2 }
                    ]);
                    sendTLP(null, null, "Rd: BPINFO");
                    log("TEST: BRS=1 (Read in Progress).", "info");
                }
            },
            {
                name: "Data Arrival", action: () => {
                    hideRegister();
                    let pc = 0;
                    let t = setInterval(() => {
                        sendTLP(null, null, "Data", "var(--accent-orange)");
                        pc++; if (pc > 3) {
                            clearInterval(t);
                            sramBlk.innerText = "DATA OK"; sramBlk.classList.add('filled');
                            log("TEST: Data receive complete without Queues. PASS.", "success");
                        }
                    }, 300);
                }
            }
        ],
        tc3: [
            { name: "INIT", action: () => { resetVisuals(); log("TC-03: Boundary / Error Injection Test."); } },
            {
                name: "Valid Read (Baseline)", action: () => {
                    log("TEST: Performing valid read first...", "info");
                    sramBlk.innerText = "OK";
                }
            },
            {
                name: "Invalid Offset Write", action: () => {
                    showRegister("BPRSEL", "0x44", "Bad Offset", [
                        { label: "BPID", val: "1" }, { label: "Offset", val: "256KB", active: true } // > 128KB
                    ]);
                    log("TEST: Writing Offset 256KB (Limit is 128KB).", "warn");
                }
            },
            {
                name: "Check Error Status", action: () => {
                    showRegister("BPINFO", "0x40", "Error Check", [
                        { label: "BRS", val: "2 (Err)", active: true, width: 2 } // Error Code
                    ]);
                    document.getElementById('sim-log').lastChild.classList.add('warn');
                    log("TEST: Controller reports BRS=2 (Read Error). PASS.", "success");
                }
            }
        ],
        // Domain 3: Active Management
        bp11: [
            { name: "INIT", action: () => { resetVisuals(); log("BP_11: Triggering Firmware Commit Action 7 (Swap)."); } },
            {
                name: "Check Current Active", action: () => {
                    showRegister("BPINFO", "0x40", "Active=0", [{ label: "ABPID", val: "0", active: true }]);
                    log("TEST: Current Active BPID is 0.", "info");
                }
            },
            {
                name: "Send Commit Cmd", action: () => {
                    hideRegister();
                    sendTLP(null, null, "Cmd: Commit (Act 7)", "var(--accent-purple)");
                    log("HOST: Sending FW Commit (Action=7, Slot=1) via Admin Queue.", "warn");
                }
            },
            {
                name: "Verify Swap", action: () => {
                    showRegister("BPINFO", "0x40", "Active=1", [{ label: "ABPID", val: "1", active: true }]);
                    log("TEST: ABPID flipped to 1. Activate Action Successful.", "success");
                }
            }
        ],
        // Domain 4: Image Update
        bp14: [
            { name: "INIT", action: () => { resetVisuals(); log("BP_14: Firmware Image Download & Commit."); } },
            {
                name: "Send FW Data", action: () => {
                    log("HOST: Sending FW Image (Admin Cmd 11h).", "info");
                    // Visualize activity on Controller
                    const ctrl = document.getElementById('nvme-ctrl');
                    if (ctrl) ctrl.classList.add('reading');

                    let i = 0;
                    let t = setInterval(() => {
                        sendTLP(null, null, "FW Chunk", "#fff");
                        i++; if (i > 4) {
                            clearInterval(t);
                            if (ctrl) ctrl.classList.remove('reading');
                            log("CTRL: Image buffered (Size=128KB).", "success");
                        }
                    }, 200);
                }
            },
            {
                name: "Commit (Act 6)", action: () => {
                    sendTLP(null, null, "Cmd: Commit 6", "var(--accent-purple)");
                    log("HOST: Sending FW Commit (Action=6) to BP0 (Inactive).", "warn");
                }
            },
            {
                name: "Verify Update", action: () => {
                    const bp0 = document.getElementById('part-bp0');
                    if (bp0) {
                        bp0.innerText = "BP0 (New Img)";
                        bp0.classList.add('filled');
                    }
                    log("TEST: BP0 updated with new image. ABPID remains 1.", "success");
                }
            }
        ],
        // Domain 5: Security
        bp20: [
            { name: "INIT", action: () => { resetVisuals(); log("BP_20: TP 4170 Security Lock Test."); } },
            {
                name: "Set Feature (Lock)", action: () => {
                    sendTLP(null, null, "Set Feat: 15h", "var(--accent-red)");
                    log("HOST: Issuing Set Features (FID=15h, Lock BP0).", "warn");
                }
            },
            {
                name: "Attempt Write", action: () => {
                    log("HOST: Attempting FW Commit to BP0...", "info");
                    sendTLP(null, null, "Cmd: Commit BP0");
                }
            },
            {
                name: "Check Rejection", action: () => {
                    log("CTRL: Command Failed. Status Code: 86h (Access Denied).", "success");
                    document.getElementById('sim-log').lastChild.classList.add('warn');
                }
            }
        ],
        // Domain 6: Boundary (Reusing Logic)
        bp25: [ // Same as TC3 / BP25
            { name: "INIT", action: () => { resetVisuals(); log("BP_25: Offset Overflow Test."); } },
            {
                name: "Invalid Offset Write", action: () => {
                    showRegister("BPRSEL", "0x44", "Bad Offset", [
                        { label: "BPID", val: "1" }, { label: "Offset", val: "256KB", active: true } // > 128KB
                    ]);
                    log("HOST: Writing Offset 256KB (Limit is 128KB).", "warn");
                }
            },
            {
                name: "Check Error Status", action: () => {
                    showRegister("BPINFO", "0x40", "Error Check", [
                        { label: "BRS", val: "3 (Err)", active: true, width: 2 }
                    ]);
                    log("TEST: Controller reports BRS Error. PASS.", "success");
                }
            }
        ]
    };

    let steps = scenarios.standard;

    // Scenario Switcher
    const scenarioSelect = document.getElementById('scenario-select');
    if (scenarioSelect) {
        scenarioSelect.addEventListener('change', (e) => {
            stopAutoPlay();
            resetVisuals();
            const val = e.target.value;
            steps = scenarios[val] || scenarios.standard;
            currentStep = 0;
            updateStep(0);
            log("Switched to Scenario: " + e.target.options[e.target.selectedIndex].text);
        });
    }

    function updateStep(idx) {
        if (idx < 0 || idx >= steps.length) return;
        currentStep = idx;
        steps[currentStep].action();

        btnPrev.disabled = idx === 0;
        btnNext.disabled = idx === steps.length - 1;

        // Manual Focus: Stop autoplay if user interacts
        if (autoPlayTimer && (idx !== currentStep + 1)) {
            // If jump wasn't sequential caused by timer
            // Actually, timer logic handles this via currentStep.
        }
    }

    function resetVisuals() {
        // Scope to dashboard to avoid hiding the parent module
        const dashboard = document.querySelector('.dashboard-container');
        if (dashboard) {
            dashboard.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
            dashboard.querySelectorAll('.read-active').forEach(el => el.classList.remove('read-active'));
            dashboard.querySelectorAll('.reading').forEach(el => el.classList.remove('reading'));
            dashboard.querySelectorAll('.filled').forEach(el => el.classList.remove('filled'));
            dashboard.querySelectorAll('.active-log').forEach(el => el.classList.remove('active-log'));
        }

        logContainer.innerHTML = '';
        inspectorPanel.style.display = 'none';

        // Reset specific text
        sramBlk.innerText = "Empty";
        rcPhy.innerText = "PHY: Down";
        ltssmState.innerText = "L0 (Down)";
        linkSpeed.innerText = "--";

        // Reset and set default DRAM State
        const dramBox = document.querySelector('.dram-box');
        if (dramBox) {
            dramBox.className = 'component-box dram-box uninit';
        }
    }

    btnNext.addEventListener('click', () => {
        stopAutoPlay();
        updateStep(currentStep + 1);
    });

    btnPrev.addEventListener('click', () => {
        stopAutoPlay();
        updateStep(currentStep - 1);
    });

    function stopAutoPlay() {
        if (autoPlayTimer) {
            clearInterval(autoPlayTimer);
            autoPlayTimer = null;
            btnPlay.innerText = "▶";
        }
    }

    // Auto Play Logic
    btnPlay.addEventListener('click', () => {
        if (autoPlayTimer) {
            stopAutoPlay();
        } else {
            btnPlay.innerText = "⏸";

            // If at end, restart
            if (currentStep === steps.length - 1) updateStep(0);

            autoPlayTimer = setInterval(() => {
                if (currentStep < steps.length - 1) {
                    updateStep(currentStep + 1);
                } else {
                    stopAutoPlay();
                }
            }, 2500); // 2.5s per step for readability
        }
    });

    // --- Run Simulation Buttons (Cross-Module Linking) ---
    const runSimBtns = document.querySelectorAll('.run-sim-btn');
    runSimBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const scenarioKey = e.target.getAttribute('data-scenario');

            // 1. Switch to Dashboard Module
            // Trigger click on Nav Item for 'boot-sequence' (Module 2)
            const dashboardNavLink = document.querySelector('li[data-target="boot-sequence"]');
            if (dashboardNavLink) dashboardNavLink.click();

            // 2. Set Scenario
            if (scenarioSelect) {
                scenarioSelect.value = scenarioKey;
                // Dispatch event to trigger the change listener
                scenarioSelect.dispatchEvent(new Event('change'));
            }
        });
    });

} // End initEngineeringSimulation

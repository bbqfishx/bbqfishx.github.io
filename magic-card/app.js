document.addEventListener("DOMContentLoaded", () => {
    const settingsPanel = document.querySelector(".settings-panel");
    const prizeSettingsList = document.getElementById("prizeSettingsList");
    const addPrizeButton = document.getElementById("addPrizeBtn");
    const settingsLockButton = document.getElementById("settingsLockBtn");
    const settingsLockText = document.getElementById("settingsLockText");
    const settingsCount = document.getElementById("settingsCount");
    const prizeInventoryList = document.getElementById("prizeInventoryList");
    const twitchIdInput = document.getElementById("twitchIdInput");
    const drawHistoryTableBody = document.getElementById("drawHistoryTableBody");
    const copyDrawHistoryButton = document.getElementById("copyDrawHistoryBtn");
    const sfxVolumeRange = document.getElementById("sfxVolumeRange");
    const sfxVolumeValue = document.getElementById("sfxVolumeValue");
    const arcaneBoard = document.getElementById("arcaneBoard");
    const deckRemainingCount = document.getElementById("deckRemainingCount");
    const cardDeckButton = document.getElementById("cardDeckButton");
    const cardFan = document.getElementById("cardFan");
    const arcaneConfirmButton = document.getElementById("arcaneConfirmButton");

    const prizeTonePalette = [
        "#f0c27b", "#ef8bb6", "#8580c4", "#9db7e8",
        "#93cfc6", "#bca38f", "#b6cfaa", "#d798c4"
    ];
    const prizeSettingsStorageKey = "prize-workspace-prize-settings-v1";
    const sfxVolumeStorageKey = "prize-workspace-sfx-volume-v1";
    const candidateCardLimit = 5;
    const audio = createSynthAudioManager();

    let areSettingsLocked = false;
    let nextPrizeId = 1;
    let drawRecordSerial = 1;
    let cardDrawPhase = "idle";
    let selectedCandidateIndex = -1;
    let candidateCards = [];
    const drawHistoryRecords = [];
    const prizeInventory = new Map();
    const cardDrawTimers = new Set();

    setupPrizeSettings();
    setupSettingsLock();
    setupAudioControls();
    setupDrawHistoryCopy();
    setupCardDraw();
    exposePrizeWorkspaceApi();

    function setupPrizeSettings() {
        if (!prizeSettingsList || !addPrizeButton) {
            return;
        }

        restoreSavedPrizeSettings();
        relabelPrizeSettings();

        addPrizeButton.addEventListener("click", () => {
            if (areSettingsLocked) {
                return;
            }

            audio.unlock();
            audio.play("ui-click");
            const row = createPrizeSettingRow(prizeSettingsList.querySelectorAll("[data-prize-row]").length);
            prizeSettingsList.appendChild(row);
            relabelPrizeSettings();
            savePrizeSettings();
            row.querySelector("[data-prize-name]")?.focus();
        });

        prizeSettingsList.addEventListener("click", (event) => {
            const removeButton = event.target.closest("[data-remove-prize]");

            if (!removeButton || areSettingsLocked) {
                return;
            }

            const rows = Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"));

            if (rows.length <= 1) {
                return;
            }

            audio.unlock();
            audio.play("ui-click", { volume: 0.7 });
            removeButton.closest("[data-prize-row]")?.remove();
            relabelPrizeSettings();
            savePrizeSettings();
        });

        prizeSettingsList.addEventListener("input", (event) => {
            if (areSettingsLocked || !event.target.matches("[data-prize-name], [data-prize-quantity]")) {
                return;
            }

            if (event.target.matches("[data-prize-quantity]")) {
                event.target.value = normalizePrizeQuantity(event.target.value);
            }

            updateSettingsCount();
            syncPrizeInventoryFromSettings();
            savePrizeSettings();
        });
    }

    function createPrizeSettingRow(index, data = {}) {
        const row = document.createElement("div");
        const rank = prizeRankLabel(index);
        const name = typeof data.name === "string" ? data.name : defaultPrizeName(index);
        const quantity = normalizePrizeQuantity(data.quantity ?? 1);

        row.className = "prize-setting-row";
        row.setAttribute("data-prize-row", "");

        const rankNode = document.createElement("span");
        rankNode.className = "prize-rank";
        rankNode.setAttribute("data-prize-rank", "");
        rankNode.textContent = rank;

        const nameInput = document.createElement("input");
        nameInput.className = "prize-input";
        nameInput.type = "text";
        nameInput.value = name;
        nameInput.setAttribute("data-prize-name", "");
        nameInput.setAttribute("aria-label", `${rank}獎項`);

        const quantityInput = document.createElement("input");
        quantityInput.className = "prize-input prize-quantity";
        quantityInput.type = "number";
        quantityInput.value = String(quantity);
        quantityInput.min = "0";
        quantityInput.max = "999";
        quantityInput.step = "1";
        quantityInput.setAttribute("data-prize-quantity", "");
        quantityInput.setAttribute("aria-label", `${rank}初始數量`);

        const removeButton = document.createElement("button");
        removeButton.className = "prize-remove-button";
        removeButton.type = "button";
        removeButton.setAttribute("data-remove-prize", "");
        removeButton.setAttribute("aria-label", `移除${rank}`);
        removeButton.innerHTML = "&times;";

        row.append(rankNode, nameInput, quantityInput, removeButton);

        return row;
    }

    function restoreSavedPrizeSettings() {
        if (!prizeSettingsList) {
            return;
        }

        const savedSettings = loadPrizeSettings();

        if (!savedSettings || savedSettings.length < 1) {
            return;
        }

        const fragment = document.createDocumentFragment();

        savedSettings.forEach((item, index) => {
            fragment.appendChild(createPrizeSettingRow(index, item));
        });

        prizeSettingsList.replaceChildren(fragment);
    }

    function loadPrizeSettings() {
        try {
            const rawValue = window.localStorage?.getItem(prizeSettingsStorageKey);

            if (!rawValue) {
                return null;
            }

            const parsed = JSON.parse(rawValue);
            const savedPrizes = Array.isArray(parsed?.prizes) ? parsed.prizes : [];
            const normalizedPrizes = savedPrizes.map((item) => ({
                name: typeof item?.name === "string" ? item.name : "",
                quantity: normalizePrizeQuantity(item?.quantity)
            }));

            return normalizedPrizes.length > 0 ? normalizedPrizes : null;
        } catch {
            return null;
        }
    }

    function savePrizeSettings() {
        if (!prizeSettingsList) {
            return;
        }

        const rows = Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"));
        const prizesToSave = rows.map((row) => ({
            name: row.querySelector("[data-prize-name]")?.value || "",
            quantity: normalizePrizeQuantity(row.querySelector("[data-prize-quantity]")?.value)
        }));

        try {
            window.localStorage?.setItem(prizeSettingsStorageKey, JSON.stringify({
                version: 1,
                prizes: prizesToSave
            }));
        } catch {
            // Storage may be unavailable; the form still works for the current page session.
        }
    }

    function setupSettingsLock() {
        if (!settingsLockButton) {
            return;
        }

        settingsLockButton.addEventListener("click", () => {
            audio.unlock();
            audio.play("lock-toggle");
            setSettingsLocked(!areSettingsLocked);
        });

        setSettingsLocked(false);
    }

    function setSettingsLocked(locked) {
        areSettingsLocked = Boolean(locked);
        settingsPanel?.classList.toggle("is-settings-locked", areSettingsLocked);

        const label = areSettingsLocked ? "解鎖獎項設定" : "鎖定獎項設定";

        if (settingsLockButton) {
            settingsLockButton.setAttribute("aria-label", label);
            settingsLockButton.setAttribute("aria-pressed", String(areSettingsLocked));
            settingsLockButton.setAttribute("title", label);
        }

        if (settingsLockText) {
            settingsLockText.textContent = label;
        }

        if (addPrizeButton) {
            addPrizeButton.disabled = areSettingsLocked;
        }

        updatePrizeSettingDisabledState();
    }

    function updatePrizeSettingDisabledState() {
        if (!prizeSettingsList) {
            return;
        }

        const rows = Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"));

        rows.forEach((row) => {
            row.querySelectorAll("[data-prize-name], [data-prize-quantity]").forEach((input) => {
                input.disabled = areSettingsLocked;
            });

            const removeButton = row.querySelector("[data-remove-prize]");

            if (removeButton) {
                removeButton.disabled = areSettingsLocked || rows.length <= 1;
            }
        });
    }

    function setupAudioControls() {
        if (!sfxVolumeRange) {
            return;
        }

        const savedVolume = loadSfxVolume();
        const initialVolume = savedVolume === null ? 0.42 : savedVolume;

        audio.setVolume(initialVolume);
        sfxVolumeRange.value = String(Math.round(audio.getVolume() * 100));
        updateVolumeDisplay(audio.getVolume());

        sfxVolumeRange.addEventListener("input", () => {
            audio.setVolume(getVolumeFromRange());
            updateVolumeDisplay(audio.getVolume());
        });

        sfxVolumeRange.addEventListener("change", () => {
            audio.unlock();
            audio.setVolume(getVolumeFromRange());
            updateVolumeDisplay(audio.getVolume());
            saveSfxVolume(audio.getVolume());
            audio.play("ui-click", { volume: 0.55 });
        });
    }

    function getVolumeFromRange() {
        const value = Number.parseInt(sfxVolumeRange.value, 10);
        const percentage = Number.isFinite(value) ? Math.max(0, Math.min(value, 100)) : 42;

        return percentage / 100;
    }

    function updateVolumeDisplay(volume) {
        const percentage = Math.round(normalizeAudioVolume(volume) * 100);

        sfxVolumeRange.value = String(percentage);
        sfxVolumeRange.style.setProperty("--volume-level", `${percentage}%`);
        sfxVolumeRange.setAttribute("aria-valuetext", `${percentage}%`);

        if (sfxVolumeValue) {
            sfxVolumeValue.textContent = `${percentage}%`;
        }
    }

    function loadSfxVolume() {
        try {
            const rawValue = window.localStorage?.getItem(sfxVolumeStorageKey);

            if (rawValue === null || rawValue === undefined) {
                return null;
            }

            return normalizeAudioVolume(rawValue);
        } catch {
            return null;
        }
    }

    function saveSfxVolume(value) {
        try {
            window.localStorage?.setItem(sfxVolumeStorageKey, String(normalizeAudioVolume(value)));
        } catch {
            // Storage may be unavailable; keep the control usable without persistence.
        }
    }

    function normalizeAudioVolume(value) {
        const volume = Number.parseFloat(value);

        return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.42;
    }

    function normalizePrizeQuantity(value) {
        const quantity = Number.parseInt(value, 10);

        return Number.isFinite(quantity) ? Math.max(0, Math.min(quantity, 999)) : 0;
    }

    function relabelPrizeSettings() {
        if (!prizeSettingsList) {
            return;
        }

        const rows = Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"));

        rows.forEach((row, index) => {
            const rank = prizeRankLabel(index);
            const defaultName = defaultPrizeName(index);
            const tone = getPrizeTone(index, row);
            const rankNode = row.querySelector("[data-prize-rank]");
            const nameInput = row.querySelector("[data-prize-name]");
            const quantityInput = row.querySelector("[data-prize-quantity]");
            const removeButton = row.querySelector("[data-remove-prize]");

            ensurePrizeRowId(row);
            row.style.setProperty("--rank-tone", tone);

            if (rankNode) {
                rankNode.textContent = rank;
            }

            if (nameInput) {
                if (isGeneratedPrizeName(nameInput.value.trim())) {
                    nameInput.value = defaultName;
                }

                nameInput.setAttribute("aria-label", `${rank}獎項`);
            }

            if (quantityInput) {
                quantityInput.value = String(normalizePrizeQuantity(quantityInput.value));
                quantityInput.setAttribute("aria-label", `${rank}初始數量`);
                quantityInput.min = "0";
                quantityInput.max = "999";
            }

            if (removeButton) {
                removeButton.setAttribute("aria-label", `移除${rank}`);
                removeButton.disabled = areSettingsLocked || rows.length <= 1;
            }
        });

        updateSettingsCount(rows);
        syncPrizeInventoryFromSettings();
        updatePrizeSettingDisabledState();
    }

    function ensurePrizeRowId(row) {
        if (!row.dataset.prizeId) {
            row.dataset.prizeId = `prize-${nextPrizeId}`;
            nextPrizeId += 1;
        }

        return row.dataset.prizeId;
    }

    function updateSettingsCount(rows) {
        if (!settingsCount || !prizeSettingsList) {
            return;
        }

        const activeRows = rows || Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"));
        const totalQuantity = activeRows.reduce((total, row) => {
            const quantity = normalizePrizeQuantity(row.querySelector("[data-prize-quantity]")?.value);

            return total + quantity;
        }, 0);

        settingsCount.textContent = `${activeRows.length} 項 / ${totalQuantity} 個`;
    }

    function prizeRankLabel(index) {
        let value = index;
        let label = "";

        do {
            label = String.fromCharCode(65 + (value % 26)) + label;
            value = Math.floor(value / 26) - 1;
        } while (value >= 0);

        return `${label}賞`;
    }

    function defaultPrizeName(index) {
        return `${prizeRankLabel(index)}品項`;
    }

    function isGeneratedPrizeName(value) {
        return /^[A-Z]+賞品項$/.test(value);
    }

    function getPrizeTone(index, row) {
        const tone = prizeTonePalette[index % prizeTonePalette.length];

        if (row) {
            row.dataset.prizeTone = tone;
        }

        return tone;
    }

    function getConfiguredPrizeRows() {
        if (!prizeSettingsList) {
            return [];
        }

        return Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]")).map((row, index) => {
            const rank = prizeRankLabel(index);
            const name = row.querySelector("[data-prize-name]")?.value.trim() || "";
            const quantity = normalizePrizeQuantity(row.querySelector("[data-prize-quantity]")?.value);

            return {
                id: ensurePrizeRowId(row),
                row,
                rowIndex: index,
                name,
                quantity,
                rarity: rank,
                symbol: rank.replace("賞", ""),
                tone: getPrizeTone(index, row)
            };
        });
    }

    function syncPrizeInventoryFromSettings() {
        const configuredRows = getConfiguredPrizeRows();
        const activePrizeIds = new Set(configuredRows.map((item) => item.id));

        Array.from(prizeInventory.keys()).forEach((prizeId) => {
            if (!activePrizeIds.has(prizeId)) {
                prizeInventory.delete(prizeId);
            }
        });

        configuredRows.forEach((item) => {
            const existing = prizeInventory.get(item.id);
            const remainingQuantity = existing && existing.configuredQuantity === item.quantity
                ? Math.min(existing.remainingQuantity, item.quantity)
                : item.quantity;

            prizeInventory.set(item.id, {
                ...item,
                configuredQuantity: item.quantity,
                remainingQuantity: Math.max(0, remainingQuantity)
            });
        });

        renderPrizeInventoryList();
    }

    function getPrizeInventoryRows() {
        return getConfiguredPrizeRows()
            .map((item) => prizeInventory.get(item.id))
            .filter(Boolean);
    }

    function renderPrizeInventoryList() {
        if (!prizeInventoryList) {
            return;
        }

        const fragment = document.createDocumentFragment();
        const items = getPrizeInventoryRows();

        items.forEach((item) => {
            const card = document.createElement("article");
            const detail = document.createElement("div");
            const rank = document.createElement("span");
            const name = document.createElement("div");
            const remaining = document.createElement("div");
            const remainingLabel = document.createElement("span");
            const remainingValue = document.createElement("strong");
            const remainingUnit = document.createElement("span");

            card.className = "inventory-prize-card";
            card.style.setProperty("--inventory-tone", item.tone);
            card.dataset.prizeId = item.id;

            if (item.remainingQuantity < 1) {
                card.classList.add("is-empty");
            }

            detail.className = "inventory-prize-detail";
            rank.className = "inventory-rank";
            rank.textContent = item.rarity;
            name.className = "inventory-name";
            name.textContent = item.name || "未命名獎項";

            remaining.className = "inventory-remaining";
            remainingLabel.className = "inventory-remaining-label";
            remainingLabel.textContent = "剩餘";
            remainingValue.className = "inventory-remaining-value";
            remainingValue.textContent = item.remainingQuantity;
            remainingUnit.className = "inventory-remaining-unit";
            remainingUnit.textContent = "件";

            detail.append(rank, name);
            remaining.append(remainingLabel, remainingValue, remainingUnit);
            card.append(detail, remaining);
            fragment.appendChild(card);
        });

        prizeInventoryList.replaceChildren(fragment);
        updateCardDrawUi();
    }

    function getConfiguredPrizePool() {
        const configured = [];

        getPrizeInventoryRows().forEach((item) => {
            if (!item.name || item.remainingQuantity < 1) {
                return;
            }

            for (let count = 0; count < item.remainingQuantity; count += 1) {
                configured.push({
                    id: item.id,
                    name: item.name,
                    rarity: item.rarity,
                    symbol: item.symbol,
                    tone: item.tone,
                    rowIndex: item.rowIndex
                });
            }
        });

        return configured;
    }

    function getTotalPrizeQuantity() {
        return getPrizeInventoryRows().reduce((total, item) => total + (item.name ? item.remainingQuantity : 0), 0);
    }

    function pickPrizes(count) {
        const pool = getConfiguredPrizePool();
        const drawCount = Math.max(0, Math.min(normalizePrizeQuantity(count), pool.length));

        return shuffleArray(pool).slice(0, drawCount);
    }

    function consumeSelectedPrizes(items) {
        const consumedByPrize = new Map();

        items.forEach((item) => {
            if (!item.id) {
                return;
            }

            consumedByPrize.set(item.id, (consumedByPrize.get(item.id) || 0) + 1);
        });

        consumedByPrize.forEach((amount, prizeId) => {
            const item = prizeInventory.get(prizeId);

            if (item) {
                item.remainingQuantity = Math.max(0, item.remainingQuantity - amount);
            }
        });

        renderPrizeInventoryList();
    }

    function drawPrizes(count = 1, options = {}) {
        const participantId = typeof options.participantId === "string" && options.participantId.trim()
            ? options.participantId.trim()
            : getParticipantId();

        if (!participantId) {
            twitchIdInput?.focus();
            return {
                ok: false,
                reason: "missing-participant",
                prizes: []
            };
        }

        const selectedPrizes = pickPrizes(count);

        if (selectedPrizes.length < 1) {
            return {
                ok: false,
                reason: "empty-prize-pool",
                prizes: []
            };
        }

        setSettingsLocked(true);
        consumeSelectedPrizes(selectedPrizes);
        addDrawHistoryRecords(selectedPrizes, participantId);

        return {
            ok: true,
            participantId,
            prizes: selectedPrizes.map(toPublicPrize),
            remaining: getTotalPrizeQuantity()
        };
    }

    function setupCardDraw() {
        if (!cardDeckButton || !cardFan) {
            return;
        }

        cardDeckButton.addEventListener("click", beginCardCandidateDraw);
        arcaneConfirmButton?.addEventListener("click", confirmCardDrawResult);
        cardFan.addEventListener("click", (event) => {
            const card = event.target.closest("[data-candidate-index]");

            if (!card) {
                return;
            }

            selectCandidateCard(Number.parseInt(card.dataset.candidateIndex, 10));
        });

        twitchIdInput?.addEventListener("input", () => {
            if (cardDrawPhase === "idle") {
                updateCardDrawUi();
            }
        });

        updateCardDrawUi();
    }

    function beginCardCandidateDraw() {
        if (cardDrawPhase !== "idle") {
            return;
        }

        audio.unlock();
        const participantId = getParticipantId();

        if (!participantId) {
            audio.play("error");
            setArcaneStatus("請先輸入抽獎者ID");
            arcaneBoard?.classList.add("is-alert");
            twitchIdInput?.focus();
            scheduleCardDrawStep(() => {
                arcaneBoard?.classList.remove("is-alert");
                updateCardDrawUi();
            }, 780);
            return;
        }

        if (getTotalPrizeQuantity() < 1) {
            audio.play("error");
            setArcaneStatus("獎項已抽完");
            updateCardDrawUi();
            return;
        }

        clearCardDrawTimers();
        hideArcaneConfirm();
        cardFan.replaceChildren();
        candidateCards = pickPrizes(candidateCardLimit);
        selectedCandidateIndex = -1;
        cardDrawPhase = "drawing";
        setSettingsLocked(true);
        arcaneBoard?.classList.remove("is-complete", "is-alert");
        arcaneBoard?.classList.add("is-drawing");
        cardFan.dataset.state = "drawing";
        setArcaneStatus("召喚候選卡");
        audio.play("deck-summon");
        renderCandidateCards(candidateCards);
        playCandidateDealSounds(candidateCards.length);
        updateCardDrawUi({ preserveStatus: true });

        scheduleCardDrawStep(() => {
            if (cardDrawPhase !== "drawing") {
                return;
            }

            cardDrawPhase = "choosing";
            arcaneBoard?.classList.remove("is-drawing");
            arcaneBoard?.classList.add("is-choosing");
            cardFan.dataset.state = "choosing";
            setArcaneStatus("選擇一張卡牌");
            updateCandidateCardButtons();
            updateCardDrawUi({ preserveStatus: true });
        }, 720);
    }

    function selectCandidateCard(index) {
        if (cardDrawPhase !== "choosing" || !Number.isInteger(index)) {
            return;
        }

        const selectedPrize = candidateCards[index];

        if (!selectedPrize) {
            return;
        }

        const participantId = getParticipantId();

        if (!participantId) {
            audio.play("error");
            setArcaneStatus("請先輸入抽獎者ID");
            twitchIdInput?.focus();
            return;
        }

        audio.unlock();
        audio.play("card-select");
        cardDrawPhase = "revealing";
        selectedCandidateIndex = index;
        arcaneBoard?.classList.remove("is-choosing");
        arcaneBoard?.classList.add("is-revealing");
        cardFan.dataset.state = "revealing";
        setArcaneStatus("揭示卡牌");
        revealCandidateCards(index);
        playRevealSounds(candidateCards.length);
        updateCardDrawUi({ preserveStatus: true });

        scheduleCardDrawStep(() => {
            if (cardDrawPhase !== "revealing") {
                return;
            }

            consumeSelectedPrizes([selectedPrize]);
            addDrawHistoryRecords([selectedPrize], participantId);
            audio.play("reward", { volume: 0.78 });
            setArcaneStatus("抽卡完成");
            arcaneBoard?.classList.remove("is-revealing");
            arcaneBoard?.classList.add("is-complete");
            cardDrawPhase = "complete";
            showArcaneConfirm();
            updateCardDrawUi({ preserveStatus: true });
        }, 760);
    }

    function renderCandidateCards(items) {
        if (!cardFan) {
            return;
        }

        const fragment = document.createDocumentFragment();
        const count = items.length;

        items.forEach((item, index) => {
            const card = document.createElement("button");
            const cardInner = document.createElement("span");
            const back = document.createElement("span");
            const backMark = document.createElement("span");
            const front = document.createElement("span");
            const rarity = document.createElement("span");
            const glow = document.createElement("span");
            const offset = index - (count - 1) / 2;

            card.className = "candidate-card";
            card.type = "button";
            card.disabled = true;
            card.dataset.candidateIndex = String(index);
            card.style.setProperty("--card-tone", item.tone);
            card.style.setProperty("--card-index", String(index));
            card.style.setProperty("--card-count", String(count));
            card.style.setProperty("--card-offset", String(offset));
            card.style.setProperty("--deal-delay", `${index * 68}ms`);
            card.setAttribute("aria-label", `候選卡 ${index + 1}`);

            cardInner.className = "candidate-card-inner";
            back.className = "candidate-card-face candidate-card-back";
            backMark.className = "candidate-card-back-mark";
            front.className = "candidate-card-face candidate-card-front";
            rarity.className = "candidate-card-rarity";
            rarity.textContent = item.rarity;
            glow.className = "candidate-card-glow";

            back.appendChild(backMark);
            front.append(rarity, glow);
            cardInner.append(back, front);
            card.appendChild(cardInner);
            fragment.appendChild(card);
        });

        cardFan.style.setProperty("--candidate-count", String(count));
        cardFan.replaceChildren(fragment);
    }

    function playCandidateDealSounds(count) {
        for (let index = 0; index < count; index += 1) {
            scheduleCardDrawStep(() => {
                audio.play("card-deal", { index });
            }, 84 + index * 68);
        }
    }

    function playRevealSounds(count) {
        for (let index = 0; index < count; index += 1) {
            scheduleCardDrawStep(() => {
                audio.play("card-flip", { index });
            }, index * 46);
        }
    }

    function updateCandidateCardButtons() {
        if (!cardFan) {
            return;
        }

        Array.from(cardFan.querySelectorAll(".candidate-card")).forEach((card) => {
            const index = Number.parseInt(card.dataset.candidateIndex, 10);
            const item = candidateCards[index];

            card.disabled = cardDrawPhase !== "choosing";
            card.setAttribute("aria-label", item ? `選擇 ${item.rarity} ${item.name}` : "選擇候選卡");
        });
    }

    function revealCandidateCards(selectedIndex) {
        if (!cardFan) {
            return;
        }

        Array.from(cardFan.querySelectorAll(".candidate-card")).forEach((card) => {
            const index = Number.parseInt(card.dataset.candidateIndex, 10);
            const isSelected = index === selectedIndex;

            card.disabled = true;
            card.classList.add("is-revealed");
            card.classList.toggle("is-selected", isSelected);
            card.classList.toggle("is-not-selected", !isSelected);
            card.setAttribute("aria-pressed", String(isSelected));
        });
    }

    function markReturningCards(selectedIndex) {
        if (!cardFan) {
            return;
        }

        cardFan.querySelectorAll(".candidate-card").forEach((card) => {
            const index = Number.parseInt(card.dataset.candidateIndex, 10);

            if (index !== selectedIndex) {
                card.classList.add("is-returning");
            }
        });

        cardDeckButton?.classList.add("is-receiving");
        audio.play("card-return");
    }

    function removeReturningCards() {
        if (!cardFan) {
            return;
        }

        cardFan.querySelectorAll(".candidate-card.is-returning").forEach((card) => {
            card.remove();
        });

        cardDeckButton?.classList.remove("is-receiving");
    }

    function destroySelectedCard(selectedIndex) {
        if (!cardFan) {
            return;
        }

        const selectedCard = cardFan.querySelector(`.candidate-card[data-candidate-index="${selectedIndex}"]`);

        if (selectedCard) {
            selectedCard.querySelectorAll(".destruction-shard").forEach((shard) => shard.remove());
            createDestructionShards(selectedCard);
            selectedCard.classList.add("is-destroying");
            audio.play("card-destroy");
        }
    }

    function createDestructionShards(card) {
        const shardCount = 14;

        for (let index = 0; index < shardCount; index += 1) {
            const shard = document.createElement("span");
            const angle = (Math.PI * 2 * index) / shardCount;
            const distance = 52 + (index % 5) * 11;
            const x = Math.round(Math.cos(angle) * distance);
            const y = Math.round(Math.sin(angle) * distance - 18);
            const rotation = Math.round((index - shardCount / 2) * 29);

            shard.className = "destruction-shard";
            shard.style.setProperty("--shard-x", `${x}px`);
            shard.style.setProperty("--shard-y", `${y}px`);
            shard.style.setProperty("--shard-r", `${rotation}deg`);
            shard.style.setProperty("--shard-delay", `${index * 18}ms`);
            card.appendChild(shard);
        }
    }

    function startDeckShuffle() {
        cardDeckButton?.classList.add("is-shuffling");
        audio.play("deck-shuffle");
    }

    function confirmCardDrawResult() {
        if (cardDrawPhase !== "complete" || selectedCandidateIndex < 0) {
            return;
        }

        audio.unlock();
        audio.play("ui-click", { volume: 0.65 });
        hideArcaneConfirm();
        markReturningCards(selectedCandidateIndex);
        destroySelectedCard(selectedCandidateIndex);
        cardDrawPhase = "returning";
        arcaneBoard?.classList.remove("is-complete");
        arcaneBoard?.classList.add("is-returning");
        updateCardDrawUi({ preserveStatus: true });

        scheduleCardDrawStep(() => {
            removeReturningCards();
            startDeckShuffle();
        }, 620);

        scheduleCardDrawStep(() => {
            finishCardDrawRound();
        }, 1500);
    }

    function finishCardDrawRound() {
        cardFan?.replaceChildren();
        candidateCards = [];
        selectedCandidateIndex = -1;
        cardDrawPhase = "idle";
        arcaneBoard?.classList.remove("is-drawing", "is-choosing", "is-revealing", "is-complete", "is-returning", "is-alert");
        cardDeckButton?.classList.remove("is-receiving", "is-shuffling");
        if (cardFan) {
            cardFan.dataset.state = "idle";
        }
        hideArcaneConfirm();
        updateCardDrawUi();
    }

    function updateCardDrawUi(options = {}) {
        const totalRemaining = getTotalPrizeQuantity();

        if (deckRemainingCount) {
            deckRemainingCount.textContent = String(totalRemaining);
        }

        if (cardDeckButton) {
            const isBusy = cardDrawPhase !== "idle";
            const isEmpty = totalRemaining < 1;

            cardDeckButton.disabled = isBusy || isEmpty;
            cardDeckButton.setAttribute("aria-disabled", String(cardDeckButton.disabled));
        }

        if (options.preserveStatus || cardDrawPhase !== "idle") {
            return;
        }

        if (totalRemaining < 1) {
            setArcaneStatus("獎項已抽完");
            return;
        }

        setArcaneStatus(getParticipantId() ? "牌堆就緒" : "等待抽獎者ID");
    }

    function showArcaneConfirm() {
        if (!arcaneConfirmButton) {
            return;
        }

        arcaneConfirmButton.hidden = false;
        arcaneConfirmButton.disabled = false;
        arcaneConfirmButton.focus({ preventScroll: true });
    }

    function hideArcaneConfirm() {
        if (!arcaneConfirmButton) {
            return;
        }

        arcaneConfirmButton.hidden = true;
        arcaneConfirmButton.disabled = true;
    }

    function setArcaneStatus() {
        // Visible status intentionally only shows the remaining count.
    }

    function scheduleCardDrawStep(callback, delay) {
        const timer = window.setTimeout(() => {
            cardDrawTimers.delete(timer);
            callback();
        }, delay);

        cardDrawTimers.add(timer);

        return timer;
    }

    function clearCardDrawTimers() {
        cardDrawTimers.forEach((timer) => {
            window.clearTimeout(timer);
        });
        cardDrawTimers.clear();
    }

    function createSynthAudioManager() {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        let context = null;
        let masterGain = null;
        let noiseBuffer = null;
        let masterVolume = 0.42;

        function getContext() {
            if (!AudioContextConstructor) {
                return null;
            }

            if (!context) {
                context = new AudioContextConstructor();
                masterGain = context.createGain();
                masterGain.gain.value = masterVolume;
                masterGain.connect(context.destination);
            }

            return context;
        }

        function unlock() {
            const ctx = getContext();

            if (ctx?.state === "suspended") {
                ctx.resume().catch(() => {});
            }
        }

        function play(name, options = {}) {
            unlock();

            const players = {
                "ui-click": playUiClick,
                "lock-toggle": playLockToggle,
                "deck-summon": playDeckSummon,
                "card-deal": playCardDeal,
                "card-select": playCardSelect,
                "card-flip": playCardFlip,
                "card-return": playCardReturn,
                "card-destroy": playCardDestroy,
                "deck-shuffle": playDeckShuffle,
                reward: playReward,
                error: playError
            };

            players[name]?.(options);
        }

        function setVolume(value) {
            const normalized = Number(value);

            if (!Number.isFinite(normalized)) {
                return;
            }

            masterVolume = Math.max(0, Math.min(1, normalized));

            if (!context || !masterGain) {
                return;
            }

            const now = context.currentTime;
            masterGain.gain.cancelScheduledValues(now);
            masterGain.gain.setTargetAtTime(masterVolume, now, 0.02);
        }

        function getVolume() {
            return masterVolume;
        }

        function playTone({ frequency, type = "sine", duration = 0.12, volume = 0.12, start = 0, attack = 0.006, release = 0.04, slideTo = null, detune = 0 }) {
            const ctx = getContext();

            if (!ctx || !masterGain) {
                return;
            }

            const startTime = ctx.currentTime + start;
            const endTime = startTime + duration;
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, startTime);
            oscillator.detune.setValueAtTime(detune, startTime);

            if (slideTo) {
                oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), endTime);
            }

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + attack);
            gain.gain.exponentialRampToValueAtTime(0.0001, endTime + release);

            oscillator.connect(gain);
            gain.connect(masterGain);
            oscillator.start(startTime);
            oscillator.stop(endTime + release + 0.03);
        }

        function playNoise({ duration = 0.14, volume = 0.08, start = 0, filterType = "lowpass", frequency = 900, endFrequency = null }) {
            const ctx = getContext();

            if (!ctx || !masterGain) {
                return;
            }

            const startTime = ctx.currentTime + start;
            const endTime = startTime + duration;
            const source = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            source.buffer = getNoiseBuffer(ctx);
            filter.type = filterType;
            filter.frequency.setValueAtTime(frequency, startTime);

            if (endFrequency) {
                filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), endTime);
            }

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, endTime + 0.04);

            source.connect(filter);
            filter.connect(gain);
            gain.connect(masterGain);
            source.start(startTime);
            source.stop(endTime + 0.06);
        }

        function getNoiseBuffer(ctx) {
            if (noiseBuffer) {
                return noiseBuffer;
            }

            const length = ctx.sampleRate;
            noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);

            for (let index = 0; index < length; index += 1) {
                data[index] = Math.random() * 2 - 1;
            }

            return noiseBuffer;
        }

        function playUiClick(options = {}) {
            const volume = 0.075 * (options.volume ?? 1);
            playTone({ frequency: 760, type: "triangle", duration: 0.035, volume });
            playTone({ frequency: 1140, type: "sine", duration: 0.04, volume: volume * 0.72, start: 0.026 });
        }

        function playLockToggle() {
            playTone({ frequency: 420, type: "triangle", duration: 0.06, volume: 0.075, slideTo: 620 });
            playTone({ frequency: 830, type: "sine", duration: 0.045, volume: 0.055, start: 0.055 });
        }

        function playDeckSummon() {
            playNoise({ duration: 0.28, volume: 0.028, filterType: "bandpass", frequency: 620, endFrequency: 2100 });
            playTone({ frequency: 196, type: "triangle", duration: 0.18, volume: 0.052, slideTo: 392 });
            [523, 659, 784].forEach((frequency, index) => {
                playTone({ frequency, type: "sine", duration: 0.15, volume: 0.045, start: 0.05 + index * 0.055 });
            });
        }

        function playCardDeal(options = {}) {
            const index = Number.isFinite(options.index) ? options.index : 0;
            const rate = 1 + index * 0.035;
            playNoise({ duration: 0.055, volume: 0.026, filterType: "highpass", frequency: 1800 * rate, endFrequency: 850 * rate });
            playTone({ frequency: 360 * rate, type: "triangle", duration: 0.055, volume: 0.038, slideTo: 250 * rate });
        }

        function playCardSelect() {
            playTone({ frequency: 622, type: "sine", duration: 0.08, volume: 0.06 });
            playTone({ frequency: 932, type: "triangle", duration: 0.11, volume: 0.045, start: 0.045, slideTo: 1244 });
            playNoise({ duration: 0.08, volume: 0.018, start: 0.02, filterType: "bandpass", frequency: 1800, endFrequency: 2600 });
        }

        function playCardFlip(options = {}) {
            const index = Number.isFinite(options.index) ? options.index : 0;
            const start = index * 0.012;
            playNoise({ duration: 0.07, volume: 0.025, start, filterType: "highpass", frequency: 1300, endFrequency: 2600 });
            playTone({ frequency: 540 + index * 22, type: "triangle", duration: 0.06, volume: 0.032, start: start + 0.018, slideTo: 880 + index * 30 });
        }

        function playCardReturn() {
            playNoise({ duration: 0.16, volume: 0.036, filterType: "bandpass", frequency: 1400, endFrequency: 520 });
            playTone({ frequency: 420, type: "triangle", duration: 0.13, volume: 0.04, slideTo: 210 });
        }

        function playCardDestroy() {
            playNoise({ duration: 0.24, volume: 0.062, filterType: "bandpass", frequency: 1100, endFrequency: 3400 });
            playTone({ frequency: 1046, type: "sine", duration: 0.12, volume: 0.07, slideTo: 2093 });
            playTone({ frequency: 1568, type: "triangle", duration: 0.16, volume: 0.052, start: 0.045, slideTo: 392 });
            playNoise({ duration: 0.22, volume: 0.028, start: 0.12, filterType: "highpass", frequency: 2600, endFrequency: 1200 });
        }

        function playDeckShuffle() {
            [0, 0.07, 0.14, 0.22].forEach((start, index) => {
                playNoise({ duration: 0.055, volume: 0.028, start, filterType: "highpass", frequency: 1500 + index * 180, endFrequency: 780 });
                playTone({ frequency: 260 + index * 28, type: "triangle", duration: 0.05, volume: 0.024, start: start + 0.012, slideTo: 190 + index * 20 });
            });
            playTone({ frequency: 784, type: "sine", duration: 0.1, volume: 0.035, start: 0.29 });
        }

        function playReward(options = {}) {
            const volume = options.volume ?? 1;
            [659, 880, 1175, 1568].forEach((frequency, index) => {
                playTone({
                    frequency,
                    type: "sine",
                    duration: 0.15,
                    volume: 0.05 * volume,
                    start: index * 0.065
                });
            });
            playNoise({ duration: 0.22, volume: 0.022 * volume, start: 0.08, filterType: "highpass", frequency: 2200, endFrequency: 3800 });
        }

        function playError() {
            playTone({ frequency: 220, type: "triangle", duration: 0.1, volume: 0.075, slideTo: 150 });
            playTone({ frequency: 150, type: "triangle", duration: 0.12, volume: 0.062, start: 0.09, slideTo: 120 });
        }

        return {
            unlock,
            play,
            setVolume,
            getVolume
        };
    }

    function setupDrawHistoryCopy() {
        updateCopyHistoryButtonState();

        if (!copyDrawHistoryButton) {
            return;
        }

        copyDrawHistoryButton.addEventListener("click", () => {
            audio.unlock();
            audio.play("ui-click", { volume: 0.62 });
            copyDrawHistoryTable();
        });
    }

    function getParticipantId() {
        return twitchIdInput?.value.trim() || "";
    }

    function addDrawHistoryRecords(items, participantId = getParticipantId()) {
        const normalizedParticipantId = participantId.trim();

        if (!normalizedParticipantId || !Array.isArray(items) || items.length < 1) {
            return [];
        }

        const drawTime = formatDrawTime(new Date());
        const createdRecords = [];

        items.forEach((item) => {
            const record = {
                serial: drawRecordSerial,
                rarity: item.rarity,
                prizeName: item.name,
                tone: item.tone,
                participantId: normalizedParticipantId,
                drawTime
            };

            drawHistoryRecords.unshift(record);
            createdRecords.push(record);

            if (drawHistoryTableBody) {
                drawHistoryTableBody.prepend(createDrawHistoryRow(record));
            }

            drawRecordSerial += 1;
        });

        updateCopyHistoryButtonState();
        return createdRecords;
    }

    function createDrawHistoryRow(record) {
        const row = document.createElement("tr");
        const serialCell = document.createElement("td");
        const prizeCell = document.createElement("td");
        const rarityNode = document.createElement("span");
        const prizeNameNode = document.createElement("span");
        const idCell = document.createElement("td");

        serialCell.textContent = String(record.serial);
        prizeCell.className = "draw-history-prize";
        prizeCell.style.setProperty("--history-tone", record.tone);
        rarityNode.className = "draw-history-rarity";
        rarityNode.textContent = record.rarity;
        prizeNameNode.className = "draw-history-prize-name";
        prizeNameNode.textContent = record.prizeName;
        prizeCell.append(rarityNode, prizeNameNode);
        idCell.textContent = record.participantId;

        row.append(serialCell, prizeCell, idCell);

        return row;
    }

    async function copyDrawHistoryTable() {
        if (drawHistoryRecords.length < 1 || !copyDrawHistoryButton) {
            return;
        }

        const originalText = copyDrawHistoryButton.textContent;
        const rows = [
            ["序號", "賞別", "獎品", "ID", "時間"],
            ...drawHistoryRecords.map((record) => [
                record.serial,
                record.rarity,
                record.prizeName,
                record.participantId,
                record.drawTime
            ])
        ];
        const text = rows
            .map((row) => row.map(formatTableCopyCell).join("\t"))
            .join("\n");

        try {
            await copyTextToClipboard(text);
            copyDrawHistoryButton.textContent = "已複製";
        } catch {
            copyDrawHistoryButton.textContent = "複製失敗";
        } finally {
            window.setTimeout(() => {
                copyDrawHistoryButton.textContent = originalText || "複製表格";
            }, 1200);
        }
    }

    function updateCopyHistoryButtonState() {
        if (copyDrawHistoryButton) {
            copyDrawHistoryButton.disabled = drawHistoryRecords.length < 1;
        }
    }

    function formatTableCopyCell(value) {
        return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
    }

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();

        try {
            const copied = document.execCommand("copy");

            if (!copied) {
                throw new Error("Copy command failed");
            }
        } finally {
            textArea.remove();
        }
    }

    function formatDrawTime(date) {
        const pad = (value) => String(value).padStart(2, "0");

        return [
            `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`,
            `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        ].join(" ");
    }

    function shuffleArray(items) {
        const shuffled = [...items];

        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }

        return shuffled;
    }

    function toPublicPrize(item) {
        return {
            id: item.id,
            name: item.name,
            rarity: item.rarity,
            symbol: item.symbol,
            tone: item.tone,
            rowIndex: item.rowIndex,
            configuredQuantity: item.configuredQuantity,
            remainingQuantity: item.remainingQuantity
        };
    }

    function exposePrizeWorkspaceApi() {
        window.prizeWorkspace = {
            getParticipantId,
            getPrizes: () => getPrizeInventoryRows().map(toPublicPrize),
            getTotalRemaining: getTotalPrizeQuantity,
            getCandidates: (count = candidateCardLimit) => pickPrizes(count).map(toPublicPrize),
            draw: (options = {}) => drawPrizes(1, options && typeof options === "object" ? options : {}),
            addHistory: (items, participantId) => addDrawHistoryRecords(items, participantId).map((record) => ({ ...record })),
            setSettingsLocked,
            sync: syncPrizeInventoryFromSettings
        };
    }
});

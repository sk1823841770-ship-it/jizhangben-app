(function (global, document) {
'use strict';

// UI contract:
// screens: data-settings-screen="settings|theme|about"
// actions: data-settings-action="open-settings|open-theme|open-about|back|select-theme|check-update|view-update|update-later|update-now"
// theme choices: data-theme-value="..."
// update views: data-update-state-view="idle|checking|latest|update-available|network-error|service-error"
var STORAGE_KEYS = {
theme: 'mintbook.settings.theme.v1',
update: 'mintbook.settings.update.v1'
};
var ROUTES = ['bills', 'settings', 'theme', 'backup', 'about', 'product-about'];
var ROUTE_TO_PAGE = {
settings: 'page-settings',
theme: 'page-theme',
backup: 'page-backup',
about: 'page-about',
'product-about': 'page-product-about'
};
var PAGE_TO_ROUTE = {
'page-settings': 'settings',
'page-theme': 'theme',
'page-backup': 'backup',
'page-about': 'about',
'page-product-about': 'product-about'
};
var UPDATE_STATES = ['idle', 'checking', 'latest', 'update-available', 'network-error', 'service-error'];
var config = {
updateApiUrl: 'https://api.github.com/repos/sk1823841770-ship-it/jizhangben-app/releases',
releasePageUrl: 'https://github.com/sk1823841770-ship-it/jizhangben-app/releases',
requestTimeoutMs: 10000
};
var state = {
route: 'bills',
entryPageId: 'page-bills',
theme: readStorage(STORAGE_KEYS.theme) || 'mint',
runtime: { versionName: '', versionCode: null },
update: {
status: 'idle',
message: '检查更新',
availableVersion: '',
releaseNotes: '',
releaseUrl: '',
acknowledgedVersion: '',
hasBadge: false
}
};
var updateRequest = null;
var settingsEntryFocus = null;

function readStorage(key) {
try { return global.localStorage.getItem(key); } catch (error) { return null; }
}

function writeStorage(key, value) {
try {
global.localStorage.setItem(key, value);
return true;
} catch (error) {
return false;
}
}

function parseStoredUpdate() {
var raw = readStorage(STORAGE_KEYS.update);
if (!raw) return null;
try {
var parsed = JSON.parse(raw);
return parsed && typeof parsed === 'object' ? parsed : null;
} catch (error) {
return null;
}
}

function persistUpdate() {
writeStorage(STORAGE_KEYS.update, JSON.stringify({
availableVersion: state.update.availableVersion,
releaseNotes: state.update.releaseNotes,
releaseUrl: state.update.releaseUrl,
acknowledgedVersion: state.update.acknowledgedVersion
}));
}

function cloneState() {
return JSON.parse(JSON.stringify(state));
}

function emit(name, detail, cancelable) {
return document.dispatchEvent(new CustomEvent('settingsux:' + name, {
detail: detail,
bubbles: false,
cancelable: cancelable === true
}));
}

function normalizeVersion(value) {
return String(value || '').trim().replace(/^v/i, '');
}

function parseVersion(value) {
var normalized = normalizeVersion(value);
var match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
if (!match) return null;
return {
major: parseInt(match[1], 10),
minor: parseInt(match[2], 10),
patch: parseInt(match[3], 10),
pre: match[4] ? match[4].split('.') : []
};
}

function comparePrerelease(left, right) {
if (!left.length && !right.length) return 0;
if (!left.length) return 1;
if (!right.length) return -1;
var length = Math.max(left.length, right.length);
for (var index = 0; index < length; index += 1) {
if (left[index] === undefined) return -1;
if (right[index] === undefined) return 1;
if (left[index] === right[index]) continue;
var leftNumber = /^\d+$/.test(left[index]) ? parseInt(left[index], 10) : null;
var rightNumber = /^\d+$/.test(right[index]) ? parseInt(right[index], 10) : null;
if (leftNumber !== null && rightNumber !== null) return leftNumber > rightNumber ? 1 : -1;
if (leftNumber !== null) return -1;
if (rightNumber !== null) return 1;
return left[index] > right[index] ? 1 : -1;
}
return 0;
}

function compareVersions(leftValue, rightValue) {
var left = parseVersion(leftValue);
var right = parseVersion(rightValue);
if (!left || !right) return null;
if (left.major !== right.major) return left.major > right.major ? 1 : -1;
if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
return comparePrerelease(left.pre, right.pre);
}

function isElementOpen(element) {
if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
return element.classList.contains('active') ||
element.getAttribute('data-settings-open') === 'true' ||
element.getAttribute('open') !== null;
}

function focusLater(element) {
if (!element || typeof element.focus !== 'function') return;
setTimeout(function () {
if (element.isConnected && !element.disabled) element.focus();
}, 0);
}

function closeGenericLayer(kind) {
var layers = document.querySelectorAll('[data-settings-layer="' + kind + '"]');
for (var index = layers.length - 1; index >= 0; index -= 1) {
var layer = layers[index];
if (!isElementOpen(layer)) continue;
var closeButton = layer.querySelector('[data-settings-close]');
if (closeButton) closeButton.click();
else {
layer.classList.remove('active');
layer.setAttribute('data-settings-open', 'false');
layer.setAttribute('aria-hidden', 'true');
}
return true;
}
return false;
}

function clickIfOpen(containerId, buttonId) {
var container = document.getElementById(containerId);
if (!isElementOpen(container)) return false;
var button = document.getElementById(buttonId);
if (button) button.click();
return true;
}

function callGlobal(name, args) {
if (typeof global[name] !== 'function') return false;
global[name].apply(global, args || []);
return true;
}

function closeConfirmationLayer() {
if (clickIfOpen('discard-bill-changes-modal', 'continue-editing-bill')) return true;
if (clickIfOpen('confirm-modal', 'confirm-cancel-btn')) return true;
return closeGenericLayer('confirm');
}

function closeSecondaryLayer() {
var optionSheet = document.getElementById('option-sheet');
if (isElementOpen(optionSheet)) {
if (!callGlobal('closeOptionSheet')) {
optionSheet.classList.remove('active');
optionSheet.setAttribute('aria-hidden', 'true');
}
return true;
}
var timeSheet = document.getElementById('bill-time-sheet');
if (isElementOpen(timeSheet)) {
if (!callGlobal('closeBillTimePicker')) {
timeSheet.classList.remove('active');
timeSheet.setAttribute('aria-hidden', 'true');
}
return true;
}
return closeGenericLayer('secondary');
}

function closeOrdinaryLayer() {
if (closeGenericLayer('modal')) return true;
var filterSheet = document.getElementById('home-filter-sheet');
if (isElementOpen(filterSheet)) {
if (!callGlobal('closeHomeFilterSheet')) {
filterSheet.classList.remove('active');
filterSheet.setAttribute('aria-hidden', 'true');
}
return true;
}
var actionSheet = document.getElementById('bill-action-sheet');
if (isElementOpen(actionSheet)) {
if (!callGlobal('closeBillActionSheet')) actionSheet.classList.remove('active');
return true;
}
var budgetModal = document.getElementById('budget-modal');
if (isElementOpen(budgetModal)) {
budgetModal.classList.remove('active');
focusLater(document.getElementById('open-budget-btn'));
return true;
}
return false;
}

function closeBillEditor() {
var billModal = document.getElementById('add-modal');
if (!isElementOpen(billModal)) return false;
if (!callGlobal('requestCloseBillModal')) billModal.classList.remove('active');
return true;
}

function setBusinessNavigationHidden(hidden) {
var navigation = document.querySelector('.nav-bar');
var addButton = document.getElementById('open-add-modal');
if (navigation) {
navigation.hidden = hidden;
navigation.style.display = hidden ? 'none' : '';
navigation.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}
if (addButton) {
addButton.hidden = hidden;
addButton.style.display = hidden ? 'none' : '';
addButton.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}
}

function restoreEntryPage() {
var page = document.getElementById(state.entryPageId) || document.getElementById('page-bills');
if (!page) return;
document.querySelectorAll('#page-bills, #page-stats').forEach(function (item) {
item.classList.toggle('active', item === page);
});
document.querySelectorAll('.nav-item[data-target]').forEach(function (item) {
item.classList.toggle('active', item.getAttribute('data-target') === page.id);
});
if (page.id === 'page-stats' && typeof global.renderStats === 'function') global.renderStats();
if (page.id === 'page-bills' && typeof global.renderHomeOverview === 'function') global.renderHomeOverview();
setBusinessNavigationHidden(false);
focusLater(settingsEntryFocus);
}

function syncRouteDom() {
if (!document.body) return;
document.body.setAttribute('data-settings-route', state.route);
document.body.classList.toggle('settings-route-active', state.route !== 'bills');
var screens = document.querySelectorAll('[data-settings-screen], #page-settings, #page-theme, #page-backup, #page-about, #page-product-about');
var activeScreen = null;
screens.forEach(function (screen) {
var screenRoute = screen.getAttribute('data-settings-screen') || PAGE_TO_ROUTE[screen.id];
var active = screenRoute === state.route;
screen.hidden = !active;
screen.classList.toggle('active', active);
screen.setAttribute('aria-hidden', active ? 'false' : 'true');
if (active) activeScreen = screen;
});
if (state.route === 'bills') {
document.body.classList.remove('settings-route-active');
restoreEntryPage();
return;
}
if (!activeScreen) return;
document.querySelectorAll('#page-bills, #page-stats').forEach(function (page) {
page.classList.remove('active');
});
setBusinessNavigationHidden(true);
var focusTarget = activeScreen.querySelector('[data-settings-autofocus], [data-settings-action="back"], h1, h2');
if (focusTarget && !focusTarget.hasAttribute('tabindex') && /^H[1-6]$/.test(focusTarget.tagName)) {
focusTarget.setAttribute('tabindex', '-1');
}
focusLater(focusTarget);
}

function updateText(selector, value) {
document.querySelectorAll(selector).forEach(function (element) {
element.textContent = value || '';
});
}

function syncUpdateDom() {
if (!document.body) return;
document.body.setAttribute('data-update-state', state.update.status);
if (typeof global.setSettingsUpdateState === 'function') {
var visualStateMap = {
idle: 'default',
checking: 'checking',
latest: 'latest',
'update-available': 'new',
'network-error': 'network-error',
'service-error': 'service-error'
};
global.setSettingsUpdateState(visualStateMap[state.update.status], state.update.availableVersion);
}
document.querySelectorAll('[data-update-state-view]').forEach(function (view) {
view.hidden = view.getAttribute('data-update-state-view') !== state.update.status;
});
document.querySelectorAll('[data-settings-action="check-update"]').forEach(function (button) {
var checking = state.update.status === 'checking';
button.disabled = checking;
button.setAttribute('aria-disabled', checking ? 'true' : 'false');
button.setAttribute('aria-busy', checking ? 'true' : 'false');
});
document.querySelectorAll('[data-update-badge], #settings-entry-update-dot, #settings-about-update-dot, #about-update-dot').forEach(function (badge) {
badge.hidden = !state.update.hasBadge;
badge.setAttribute('aria-hidden', state.update.hasBadge ? 'false' : 'true');
});
updateText('[data-update-status-text]', state.update.message);
updateText('#about-update-status', state.update.message);
updateText('[data-update-available-version]', state.update.availableVersion);
updateText('[data-update-release-notes]', state.update.releaseNotes);
}

function syncThemeDom() {
document.documentElement.setAttribute('data-app-theme', state.theme);
document.querySelectorAll('[data-theme-value], [data-theme]').forEach(function (choice) {
var value = choice.getAttribute('data-theme-value') || choice.getAttribute('data-theme');
var selected = value === state.theme;
choice.classList.toggle('selected', selected);
choice.setAttribute('aria-pressed', selected ? 'true' : 'false');
});
}

function syncRuntimeDom() {
updateText('[data-settings-current-version]', state.runtime.versionName || '未知');
var legacyVersion = document.querySelector('#page-about .settings-row.is-static .settings-row-value');
if (legacyVersion) legacyVersion.textContent = state.runtime.versionName || '未知';
document.querySelectorAll('[data-settings-version-code]').forEach(function (element) {
element.textContent = state.runtime.versionCode === null ? '' : String(state.runtime.versionCode);
});
}

function syncDom() {
syncRouteDom();
syncThemeDom();
syncRuntimeDom();
syncUpdateDom();
}

function notify(reason) {
syncDom();
emit('statechange', { reason: reason, state: cloneState() });
}

function navigate(route, sourceElement) {
route = PAGE_TO_ROUTE[route] || route;
if (ROUTES.indexOf(route) === -1) return false;
if (route === 'settings' && state.route === 'bills') {
var activePage = document.querySelector('#page-bills.active, #page-stats.active');
state.entryPageId = activePage ? activePage.id : 'page-bills';
settingsEntryFocus = sourceElement || document.activeElement;
}
state.route = route;
notify('navigation');
return true;
}

function navigateBack() {
if (state.route === 'product-about') return navigate('about');
if (state.route === 'theme' || state.route === 'backup' || state.route === 'about') return navigate('settings');
if (state.route === 'settings') return navigate('bills');
return false;
}

function setTheme(theme) {
var nextTheme = String(theme || '').trim();
if (!nextTheme) return false;
state.theme = nextTheme;
writeStorage(STORAGE_KEYS.theme, nextTheme);
notify('theme');
emit('themechange', { theme: nextTheme });
return true;
}

function recomputeBadge() {
var comparison = compareVersions(state.update.availableVersion, state.runtime.versionName);
state.update.hasBadge = !!state.update.availableVersion &&
state.update.availableVersion !== state.update.acknowledgedVersion &&
(comparison === null || comparison > 0);
}

function setRuntimeInfo(info) {
if (!info || typeof info !== 'object') return false;
if (info.versionName) state.runtime.versionName = normalizeVersion(info.versionName);
if (info.versionCode !== undefined && info.versionCode !== null) {
state.runtime.versionCode = parseInt(info.versionCode, 10);
}
recomputeBadge();
notify('runtime');
return true;
}

function setUpdateState(status, values) {
if (UPDATE_STATES.indexOf(status) === -1) return false;
state.update.status = status;
values = values || {};
Object.keys(values).forEach(function (key) {
if (Object.prototype.hasOwnProperty.call(state.update, key)) state.update[key] = values[key];
});
recomputeBadge();
persistUpdate();
notify('update');
return true;
}

function acknowledgeUpdate(version) {
var acknowledged = normalizeVersion(version || state.update.availableVersion);
if (!acknowledged) return false;
state.update.acknowledgedVersion = acknowledged;
recomputeBadge();
persistUpdate();
notify('update-acknowledged');
return true;
}

function releaseToCandidate(release) {
if (!release || release.draft) return null;
var version = normalizeVersion(release.tag_name || release.name);
if (!parseVersion(version)) return null;
return {
version: version,
prerelease: release.prerelease === true,
notes: String(release.body || '').trim(),
url: String(release.html_url || config.releasePageUrl)
};
}

function findLatestRelease(releases, includePrerelease) {
var candidates = (Array.isArray(releases) ? releases : []).map(releaseToCandidate).filter(function (candidate) {
return candidate && (includePrerelease || !candidate.prerelease);
});
candidates.sort(function (left, right) {
var comparison = compareVersions(left.version, right.version);
return comparison === null ? 0 : -comparison;
});
return candidates[0] || null;
}

function classifyUpdateError(error) {
if (global.navigator && global.navigator.onLine === false) return 'network-error';
if (error && (error.name === 'AbortError' || error.name === 'TypeError')) return 'network-error';
return 'service-error';
}

function checkForUpdates() {
if (updateRequest) return updateRequest;
var currentVersion = state.runtime.versionName;
if (!currentVersion || !parseVersion(currentVersion)) {
setUpdateState('service-error', { message: '暂时无法获取当前版本，请稍后重试' });
return Promise.resolve(cloneState().update);
}
if (global.navigator && global.navigator.onLine === false) {
setUpdateState('network-error', { message: '网络连接失败，请稍后重试' });
return Promise.resolve(cloneState().update);
}
setUpdateState('checking', { message: '正在检查更新…' });
var controller = typeof AbortController === 'function' ? new AbortController() : null;
var timeoutId = controller ? setTimeout(function () { controller.abort(); }, config.requestTimeoutMs) : null;
var options = { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' };
if (controller) options.signal = controller.signal;

updateRequest = global.fetch(config.updateApiUrl, options).then(function (response) {
if (!response.ok) throw new Error('Update service responded with ' + response.status);
return response.json();
}).then(function (releases) {
var includePrerelease = currentVersion.indexOf('-') !== -1;
var latest = findLatestRelease(releases, includePrerelease);
if (!latest) throw new Error('No usable release metadata');
var comparison = compareVersions(latest.version, currentVersion);
if (comparison !== null && comparison > 0) {
setUpdateState('update-available', {
message: '发现新版本 ' + latest.version,
availableVersion: latest.version,
releaseNotes: latest.notes || '暂无更新说明',
releaseUrl: latest.url
});
} else {
setUpdateState('latest', {
message: '已是最新版本',
availableVersion: '',
releaseNotes: '',
releaseUrl: ''
});
}
return cloneState().update;
}).catch(function (error) {
var status = classifyUpdateError(error);
setUpdateState(status, {
message: status === 'network-error'
? '网络连接失败，请稍后重试'
: '暂时无法检查更新，请稍后重试'
});
return cloneState().update;
}).finally(function () {
if (timeoutId !== null) clearTimeout(timeoutId);
updateRequest = null;
});
return updateRequest;
}

function openUpdatePage() {
var url = state.update.releaseUrl || config.releasePageUrl;
if (!/^https:\/\//i.test(url)) {
setUpdateState('service-error', { message: '更新页面暂时不可用，请稍后重试' });
return false;
}
acknowledgeUpdate();
if (emit('open-update-page', { url: url }, true)) global.location.href = url;
return true;
}

function handleBack() {
if (closeConfirmationLayer()) return true;
if (closeSecondaryLayer()) return true;
if (closeOrdinaryLayer()) return true;
if (closeBillEditor()) return true;
return navigateBack();
}

function handleAction(element) {
var action = element.getAttribute('data-settings-action');
if (action === 'open-settings') return navigate('settings', element);
if (action === 'open-theme') return navigate('theme', element);
if (action === 'open-about') return navigate('about', element);
if (action === 'back') return handleBack();
if (action === 'select-theme') return setTheme(element.getAttribute('data-theme-value') || element.getAttribute('data-theme'));
if (action === 'check-update') return checkForUpdates();
if (action === 'view-update') {
acknowledgeUpdate();
emit('view-update', { update: cloneState().update });
return true;
}
if (action === 'update-later') {
acknowledgeUpdate();
emit('update-later', { update: cloneState().update });
return true;
}
if (action === 'update-now') return openUpdatePage();
if (action === 'open-backup' || action === 'backup') {
emit('backup-requested', {});
return true;
}
if (action === 'restore') {
emit('restore-requested', {});
return true;
}
return false;
}

function onDocumentClick(event) {
var target = event.target.closest
? event.target.closest('[data-settings-action], [data-settings-target], [data-settings-back], [data-theme], #open-settings-button')
: null;
if (!target) return;
if (target.hasAttribute('data-theme') && !target.hasAttribute('data-settings-action')) {
setTheme(target.getAttribute('data-theme'));
return;
}
if (target.id === 'open-settings-button') {
navigate('settings', target);
return;
}
var settingsTarget = target.getAttribute('data-settings-target');
if (settingsTarget) {
navigate(settingsTarget, target);
return;
}
var settingsBack = target.getAttribute('data-settings-back');
if (settingsBack) {
navigate(settingsBack === 'page-bills' ? 'bills' : settingsBack);
return;
}
handleAction(target);
}

function configure(values) {
if (!values || typeof values !== 'object') return;
if (values.updateApiUrl) config.updateApiUrl = String(values.updateApiUrl);
if (values.releasePageUrl) config.releasePageUrl = String(values.releasePageUrl);
if (values.requestTimeoutMs) config.requestTimeoutMs = Math.max(1000, parseInt(values.requestTimeoutMs, 10));
}

function hydrate() {
var activeSettingsPage = document.querySelector('.settings-page.active');
if (activeSettingsPage && PAGE_TO_ROUTE[activeSettingsPage.id]) {
state.route = PAGE_TO_ROUTE[activeSettingsPage.id];
}
var storedUpdate = parseStoredUpdate();
if (storedUpdate) {
state.update.availableVersion = normalizeVersion(storedUpdate.availableVersion);
state.update.releaseNotes = String(storedUpdate.releaseNotes || '');
state.update.releaseUrl = String(storedUpdate.releaseUrl || '');
state.update.acknowledgedVersion = normalizeVersion(storedUpdate.acknowledgedVersion);
if (state.update.availableVersion) {
state.update.status = 'update-available';
state.update.message = '发现新版本 ' + state.update.availableVersion;
}
}
if (global.AppRuntimeInfo) setRuntimeInfo(global.AppRuntimeInfo);
else recomputeBadge();
syncDom();
}

global.addEventListener('app-runtime-info-ready', function (event) {
setRuntimeInfo(event.detail || global.AppRuntimeInfo);
});
document.addEventListener('click', onDocumentClick);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate);
else hydrate();

global.SettingsUX = Object.freeze({
getState: cloneState,
refresh: syncDom,
navigate: navigate,
back: navigateBack,
handleBack: handleBack,
setTheme: setTheme,
setRuntimeInfo: setRuntimeInfo,
checkForUpdates: checkForUpdates,
acknowledgeUpdate: acknowledgeUpdate,
compareVersions: compareVersions,
configure: configure
});
})(window, document);

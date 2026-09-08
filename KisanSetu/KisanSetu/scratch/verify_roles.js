const fs = require('fs');

const html = fs.readFileSync('frontend/index.html', 'utf8');
const js = fs.readFileSync('frontend/js/app.js', 'utf8');
const css = fs.readFileSync('frontend/css/style.css', 'utf8');

console.log('--- Portal Cards Verification ---');
const roles = ['farmer', 'buyer', 'logistics', 'admin'];
let allPassed = true;

roles.forEach(r => {
  const hasLogin = html.includes("showLoginModal('" + r + "')");
  const hasReg = html.includes("showRegisterModal('" + r + "')");
  console.log(`Portal [${r}]: Sign In button = ${hasLogin}, Register button = ${hasReg}`);
  if (!hasLogin || !hasReg) allPassed = false;
});

console.log('\n--- Register Modal Verification ---');
const hasSelectRole = html.includes('<select id="reg_role"');
const hasStaticField = html.includes('id="reg_role_static_field"');
const hasHiddenInput = html.includes('<input type="hidden" id="reg_role"');
console.log('Role dropdown removed: ' + (!hasSelectRole));
console.log('Static role field present: ' + hasStaticField);
console.log('Hidden role input present: ' + hasHiddenInput);
if (hasSelectRole || !hasStaticField || !hasHiddenInput) allPassed = false;

console.log('\n--- Modal Switch Links Verification ---');
const loginToReg = html.includes('switchToRegisterFromLogin()');
const regToLogin = html.includes('switchToLoginFromRegister()');
console.log('Login modal has switch to Register link: ' + loginToReg);
console.log('Register modal has switch to Login link: ' + regToLogin);
if (!loginToReg || !regToLogin) allPassed = false;

console.log('\n--- JS Logic Verification ---');
const hasSwitchToRegFn = js.includes('window.switchToRegisterFromLogin');
const hasSwitchToLoginFn = js.includes('window.switchToLoginFromRegister');
const hasShowRegModalStatic = js.includes('reg_role_static_field') && js.includes('reg_role_static_title');
console.log('Switch to register function in app.js: ' + hasSwitchToRegFn);
console.log('Switch to login function in app.js: ' + hasSwitchToLoginFn);
console.log('showRegisterModal populates static role fields: ' + hasShowRegModalStatic);
if (!hasSwitchToRegFn || !hasSwitchToLoginFn || !hasShowRegModalStatic) allPassed = false;

console.log('\n--- CSS Verification ---');
const hasAdminOutlineBtn = css.includes('.btn-outline-admin');
const hasModalSwitchText = css.includes('.modal-switch-text');
console.log('.btn-outline-admin present in CSS: ' + hasAdminOutlineBtn);
console.log('.modal-switch-text present in CSS: ' + hasModalSwitchText);
if (!hasAdminOutlineBtn || !hasModalSwitchText) allPassed = false;

console.log('\n=======================================');
console.log(allPassed ? 'ALL VERIFICATION CHECKS PASSED!' : 'SOME CHECKS FAILED!');
console.log('=======================================');

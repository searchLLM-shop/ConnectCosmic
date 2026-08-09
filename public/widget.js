/* Connect8 AI embed widget.
   Usage on any site, any tech stack:
   <script src="https://connect8ai.live/widget.js" data-brand="your-brand-slug"></script>
*/
(function () {
  var thisScript = document.currentScript;
  var brand = thisScript.getAttribute('data-brand');
  var origin = new URL(thisScript.src).origin;

  if (!brand) {
    console.error('[Connect8 AI widget] missing required data-brand attribute on the <script> tag.');
    return;
  }

  var launcher = document.createElement('button');
  launcher.setAttribute('type', 'button');
  launcher.setAttribute('aria-label', 'Open community chat');
  launcher.textContent = '💬';
  launcher.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px', 'width:56px', 'height:56px',
    'border-radius:50%', 'background:#6d5efc', 'color:#fff', 'border:none',
    'font-size:24px', 'line-height:56px', 'text-align:center', 'padding:0',
    'cursor:pointer', 'box-shadow:0 4px 16px rgba(0,0,0,.25)', 'z-index:2147483000',
  ].join(';');

  var frameWrap = document.createElement('div');
  frameWrap.style.cssText = [
    'position:fixed', 'bottom:88px', 'right:20px',
    'width:380px', 'height:600px',
    'max-width:calc(100vw - 40px)', 'max-height:calc(100vh - 110px)',
    'border-radius:16px', 'overflow:hidden', 'box-shadow:0 8px 32px rgba(0,0,0,.3)',
    'display:none', 'z-index:2147483000', 'background:#0f1420',
  ].join(';');

  var iframe = document.createElement('iframe');
  iframe.src = origin + '/widget/' + encodeURIComponent(brand);
  iframe.title = 'Community chat';
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  frameWrap.appendChild(iframe);

  document.body.appendChild(launcher);
  document.body.appendChild(frameWrap);

  var open = false;
  function setOpen(next) {
    open = next;
    frameWrap.style.display = open ? 'block' : 'none';
    launcher.textContent = open ? '✕' : '💬';
    launcher.setAttribute('aria-label', open ? 'Close community chat' : 'Open community chat');
  }

  launcher.addEventListener('click', function () { setOpen(!open); });

  window.addEventListener('message', function (event) {
    if (event.origin !== origin) return;
    if (event.data === 'cc-widget-close') setOpen(false);
  });
})();

"use strict";
// DOS Gaming Deluxe: profile per package, fullscreen controls, touch mapping, Gamepad API.
(function () {
  const model = window.RetroDosProfile;
  const base = document.getElementById("picture");
  const overlay = document.getElementById("deluxe-touch");
  const settings = document.getElementById("deluxe-settings");
  const gamepadStatus = document.getElementById("gamepad-state");
  const touchIds = ["up","left","down","right","a","b","shift","start","esc"];
  const selectKeys = Object.entries(model.KEYS).map(([title, code]) => [title, code]);
  let profile = model.defaults();
  let identity = "demo-v1", fullscreen = false, editLayout = false, settingsOpen = false, connectedPad = "";
  let lastGamepadSources = new Set();
  const keyLabel = code => selectKeys.find(([,value])=>value===Number(code))?.[0] || String(code);
  function profileKey() { return "retro-dosbox-deluxe-v1:" + identity; }
  function store() {
    try { localStorage.setItem(profileKey(), JSON.stringify(profile)); }
    catch (_) { message("Settings could not be saved (storage disabled)."); }
  }
  function loadProfile(gameKey) {
    identity = gameKey === "demo-v1" || /^[a-f0-9]{64}$/.test(gameKey) ? gameKey : "demo-v1";
    try { profile = model.normalize(JSON.parse(localStorage.getItem(profileKey()) || "null")); }
    catch (_) { profile = model.defaults(); }
    showProfile();
  }
  function selectOption(value) {
    return selectKeys.map(([label,code])=>`<option value="${code}"${Number(code)===Number(value)?" selected":""}>${label}</option>`).join("");
  }
  const mappingRows = document.getElementById("deluxe-mapping");
  const padRows = document.getElementById("deluxe-padmap");
  const padLabels = {0:"A / Cross",1:"B / Circle",2:"X / Square",3:"Y / Triangle",4:"L1",5:"R1",8:"Select",9:"Start",12:"D-pad Up",13:"D-pad Down",14:"D-pad Left",15:"D-pad Right"};
  mappingRows.innerHTML = touchIds.map(id=>`<label class="deluxe-map-row">${id.toUpperCase()}<select data-touch-map="${id}">${selectOption(profile.touch[id])}</select></label>`).join("");
  padRows.innerHTML = Object.entries(padLabels).map(([id,label])=>`<label class="deluxe-map-row">${label}<select data-pad-map="${id}">${selectOption(profile.gamepad[id])}</select></label>`).join("");
  for(const select of [...mappingRows.querySelectorAll("select"),...padRows.querySelectorAll("select")]) {
    select.addEventListener("change", () => {
      if(select.dataset.touchMap) profile.touch[select.dataset.touchMap] = Number(select.value);
      else profile.gamepad[select.dataset.padMap] = Number(select.value);
      store(); showProfile();
    });
  }
  const ids = {orientation:"orientation",screen:"screen",cycles:"cycles",sb:"sb",irq:"irq",
    "touch-size":"touchSize","touch-opacity":"touchOpacity","gamepad-deadzone":"deadzone"};
  for(const [elementId,field] of Object.entries(ids)) {
    document.getElementById(elementId).addEventListener("change", event => {
      const copy={...profile,[field]:event.target.value};
      profile=model.normalize(copy);
      store();showProfile();
      if(field==="orientation"&&fullscreen) window.RetroDosBox?.orientation?.(profile.orientation);
    });
  }
  document.getElementById("deluxe-reset").addEventListener("click", () => { profile=model.defaults(); store();showProfile(); });
  document.getElementById("layout-reset").addEventListener("click", () => {
    profile=model.resetPositions(profile);store();showProfile();
  });
  document.getElementById("deluxe-touch-visible").addEventListener("change", e => {
    profile.touchVisible=e.target.checked;store();showProfile();
  });
  function showProfile() {
    for(const [elementId,field] of Object.entries(ids)) document.getElementById(elementId).value=String(profile[field]);
    document.getElementById("deluxe-touch-visible").checked=profile.touchVisible;
    for(const select of mappingRows.querySelectorAll("select"))select.value=String(profile.touch[select.dataset.touchMap]);
    for(const select of padRows.querySelectorAll("select"))select.value=String(profile.gamepad[select.dataset.padMap]);
    overlay.style.setProperty("--touch-size",profile.touchSize+"px");
    overlay.style.setProperty("--touch-opacity",String(profile.touchOpacity/100));
    overlay.hidden=!fullscreen||!profile.touchVisible;
    base.classList.toggle("stretch-screen",profile.screen==="stretch");
    document.getElementById("layout-edit").setAttribute("aria-pressed",String(editLayout));
    const landscape=window.innerWidth>window.innerHeight;
    const positions=model.positions(profile,landscape);
    for(const id of touchIds){
      const item=overlay.querySelector(`[data-touch="${id}"]`);
      const [x,y]=positions[id];
      item.style.left=x+"%"; item.style.top=y+"%";
      if(!["up","down","left","right"].includes(id)) {
        const action=id==="shift"?"SHIFT":id.toUpperCase();
        item.textContent=action;
        item.setAttribute("aria-label",action+" mapped to "+keyLabel(profile.touch[id]));
      }
    }
    layoutGameScreen();
    if(settingsOpen) document.getElementById("settings-restart-hint").textContent="CPU and Sound Blaster changes apply next time this game is opened.";
  }
  function openSettings(open) {
    settingsOpen=Boolean(open);
    settings.hidden=!settingsOpen;
    if(settingsOpen){editLayout=false;releaseDeluxeInputs();}
    document.body.classList.toggle("deluxe-settings-open",settingsOpen);
    updatePause();
    showProfile();
  }
  document.getElementById("deluxe-settings-open").addEventListener("click",()=>openSettings(true));
  document.getElementById("fullscreen-settings").addEventListener("click",()=>openSettings(true));
  document.getElementById("settings-close").addEventListener("click",()=>openSettings(false));
  document.getElementById("layout-edit").addEventListener("click",()=>{
    editLayout=!editLayout;
    openSettings(false);
    overlay.classList.toggle("editing",editLayout);
    document.getElementById("layout-edit-full").hidden=!editLayout;
    if(fullscreen) window.RetroDosBox?.orientation?.(profile.orientation);
    showProfile();
  });
  document.getElementById("layout-edit-full").addEventListener("click",()=>{
    editLayout=false; overlay.classList.remove("editing");
    document.getElementById("layout-edit-full").hidden=true;store();showProfile();
  });
  // Unlike object-fit:contain in a full-height canvas, size the canvas itself
  // to the DOS image. This keeps the picture anchored at the TOP in portrait.
  function layoutGameScreen() {
    if(!fullscreen){canvas.style.width="";canvas.style.height="";return;}
    const rect=base.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0||!canvas.width||!canvas.height)return;
    const scale=Math.min(rect.width/canvas.width,rect.height/canvas.height);
    canvas.style.width=Math.max(1,Math.floor(canvas.width*scale))+"px";
    canvas.style.height=Math.max(1,Math.floor(canvas.height*scale))+"px";
  }
  window.dosboxFrameSizeChanged=layoutGameScreen;
  const resizeGame = () => {layoutGameScreen();showProfile();};
  window.addEventListener("resize",resizeGame);
  if(typeof ResizeObserver!=="undefined") new ResizeObserver(layoutGameScreen).observe(base);
  function updateFullscreen(enabled) {
    fullscreen=Boolean(enabled);
    document.body.classList.toggle("dos-fullscreen",fullscreen);
    document.getElementById("fullscreen-toggle").textContent=fullscreen?"Restore Window":"Fullscreen";
    if(!fullscreen){editLayout=false;overlay.classList.remove("editing");openSettings(false);}
    document.getElementById("layout-edit-full").hidden=!editLayout;
    if(fullscreen) window.RetroDosBox?.orientation?.(profile.orientation);
    showProfile();
    if(!fullscreen) releaseDeluxeInputs();
  }
  function requestFullscreen(enabled) {
    updateFullscreen(enabled);
    window.RetroDosBox?.fullscreen?.(Boolean(enabled));
    if(enabled) window.RetroDosBox?.orientation?.(profile.orientation);
  }
  document.getElementById("fullscreen-toggle").addEventListener("click",()=>requestFullscreen(!fullscreen));
  document.getElementById("fullscreen-exit").addEventListener("click",()=>requestFullscreen(false));
  window.dosboxFullscreenState=updateFullscreen;
  const activeSources = new Set();
  function releaseDeluxeInputs() {
    for(const source of activeSources) setInputSource(source,0,false);
    activeSources.clear();
    lastGamepadSources.clear();
  }
  for(const button of overlay.querySelectorAll("[data-touch]")) {
    const id=button.dataset.touch;
    button.addEventListener("pointerdown",event=>{
      if(!emulator || settingsOpen || !active || paused) return;
      event.preventDefault();button.setPointerCapture(event.pointerId);
      if(editLayout) {
        button.dataset.drag=String(event.pointerId);
      } else {
        const source="touch:"+id+":"+event.pointerId;
        activeSources.add(source);
        setInputSource(source,profile.touch[id],true);
      }
    });
    button.addEventListener("pointermove",event=>{
      if(!editLayout||button.dataset.drag!==String(event.pointerId))return;
      const box=overlay.getBoundingClientRect();
      const landscape=window.innerWidth>window.innerHeight;
      const positions=model.positions(profile,landscape);
      positions[id]=[
        Math.round(Math.max(3,Math.min(97,((event.clientX-box.left)/box.width)*100))),
        Math.round(Math.max(6,Math.min(97,((event.clientY-box.top)/box.height)*100)))
      ];
      showProfile();
    });
    for(const type of ["pointerup","pointercancel","lostpointercapture"]){
      button.addEventListener(type,event=>{
        if(button.dataset.drag===String(event.pointerId)){delete button.dataset.drag;store();}
        const source="touch:"+id+":"+event.pointerId;
        setInputSource(source,0,false);activeSources.delete(source);
      });
    }
    button.addEventListener("contextmenu",event=>event.preventDefault());
  }
  function sampleGamepad() {
    if(!active || paused || !emulator || settingsOpen || editLayout){
      for(const source of lastGamepadSources) setInputSource(source,0,false);
      lastGamepadSources.clear();return;
    }
    let pads=[];
    try { if(typeof navigator.getGamepads==="function") pads=navigator.getGamepads() || []; }
    catch(_) { pads=[]; }
    const pad=[...pads].find(p=>p&&p.connected);
    const newSources=new Set();
    let title="No controller connected";
    if(pad){
      title=(pad.id || "Gamepad").slice(0,54);
      for(const [index,code] of Object.entries(profile.gamepad)){
        if(!pad.buttons?.[Number(index)]?.pressed)continue;
        const source="gamepad:button:"+index;
        newSources.add(source);
        setInputSource(source,code,true);
      }
      const x=Number(pad.axes?.[0])||0, y=Number(pad.axes?.[1])||0;
      const axes=[["left",x < -profile.deadzone,263],["right",x > profile.deadzone,262],
        ["up",y < -profile.deadzone,265],["down",y > profile.deadzone,264]];
      for(const [direction,pressed,code] of axes){
        if(!pressed)continue;
        const source="gamepad:axis:"+direction;
        newSources.add(source);setInputSource(source,code,true);
      }
    }
    for(const source of lastGamepadSources)if(!newSources.has(source))setInputSource(source,0,false);
    lastGamepadSources=newSources;
    if(connectedPad!==title){connectedPad=title;gamepadStatus.textContent=title;}
  }
  function pollGamepad(){sampleGamepad();requestAnimationFrame(pollGamepad);}
  requestAnimationFrame(pollGamepad);
  window.addEventListener("blur",releaseDeluxeInputs);
  window.addEventListener("pagehide",releaseDeluxeInputs);
  window.RetroDosDeluxe={
    loadProfile, configure:conf=>model.configure(conf,profile),
    isSettingsOpen:()=>settingsOpen,
    visibleChanged(showing){if(!showing)releaseDeluxeInputs();},
    started(){showProfile();},
    exitFullscreen(){requestFullscreen(false);}
  };
  showProfile();
})();

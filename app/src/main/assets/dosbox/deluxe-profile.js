"use strict";
// Pure, bounded DOSBox Deluxe configuration model. No WebView or Android APIs.
(function (root) {
  const KEYS = Object.freeze({
    Up:265, Down:264, Left:263, Right:262, Ctrl:341, Alt:342, Space:32,
    Enter:257, Esc:256, Tab:258, Shift:340, F1:290, F2:291, F3:292,
    F4:293, F5:294, F6:295, F7:296, F8:297, F9:298, F10:299,
    A:65, B:66, C:67, D:68, E:69, F:70, G:71, H:72, I:73,
    J:74, K:75, L:76, M:77, N:78, O:79, P:80, Q:81, R:82,
    S:83, T:84, U:85, V:86, W:87, X:88, Y:89, Z:90,
    "0":48, "1":49, "2":50, "3":51, "4":52, "5":53,
    "6":54, "7":55, "8":56, "9":57, MouseLeft:-1, MouseRight:-2
  });
  const POSITIONS = Object.freeze({
    up:[15,65],left:[6,76],down:[15,86],right:[24,76],
    a:[80,75],b:[91,65],start:[52,87],esc:[52,11]
  });
  const DEFAULT_TOUCH = Object.freeze({up:265,left:263,down:264,right:262,a:341,b:342,start:257,esc:256});
  const DEFAULT_GAMEPAD = Object.freeze({0:341,1:342,2:32,3:257,4:290,5:294,8:256,9:257,12:265,13:264,14:263,15:262});
  const ALLOWED = new Set(Object.values(KEYS));
  const clamp = (v,min,max,fallback) => Number.isFinite(Number(v)) ? Math.min(max,Math.max(min,Number(v))) : fallback;
  const key = (value,fallback) => ALLOWED.has(Number(value)) ? Number(value) : fallback;
  function defaults() {
    return {orientation:"auto",screen:"fit",cycles:"auto",sb:"sb16",irq:7,
      touchVisible:true,touchSize:54,touchOpacity:76,deadzone:0.45,
      touch:{...DEFAULT_TOUCH},gamepad:{...DEFAULT_GAMEPAD},positions:Object.fromEntries(
        Object.entries(POSITIONS).map(([k,v])=>[k,[...v]]))};
  }
  function normalize(source) {
    const d=defaults();
    if (!source || typeof source!=="object" || Array.isArray(source)) return d;
    d.orientation=["auto","landscape","portrait"].includes(source.orientation)?source.orientation:d.orientation;
    d.screen=["fit","stretch"].includes(source.screen)?source.screen:d.screen;
    d.cycles=["auto","max","3000","6000","12000","20000"].includes(String(source.cycles))?String(source.cycles):d.cycles;
    d.sb=["sb16","sbpro2","none"].includes(source.sb)?source.sb:d.sb;
    d.irq=[5,7].includes(Number(source.irq))?Number(source.irq):d.irq;
    d.touchVisible=typeof source.touchVisible==="boolean"?source.touchVisible:d.touchVisible;
    d.touchSize=clamp(source.touchSize,36,86,d.touchSize);
    d.touchOpacity=clamp(source.touchOpacity,30,100,d.touchOpacity);
    d.deadzone=clamp(source.deadzone,0.25,0.85,d.deadzone);
    for(const name of Object.keys(d.touch)) {
      d.touch[name]=key(source.touch?.[name],d.touch[name]);
      const pos=source.positions?.[name];
      if(Array.isArray(pos)&&pos.length===2) {
        d.positions[name]=[clamp(pos[0],3,97,d.positions[name][0]),clamp(pos[1],6,94,d.positions[name][1])];
      }
    }
    for(const index of Object.keys(d.gamepad)) d.gamepad[index]=key(source.gamepad?.[index],d.gamepad[index]);
    return d;
  }
  function option(conf,section,setting,value) {
    const lines=String(conf||"").replace(/\r\n/g,"\n").split("\n");
    const header=`[${section}]`;
    let start=lines.findIndex(line=>line.trim().toLowerCase()===header);
    if(start<0) {
      const autoexec=lines.findIndex(line=>line.trim().toLowerCase()==="[autoexec]");
      lines.splice(autoexec<0?lines.length:autoexec,0,header,`${setting}=${value}`,"");
    } else {
      let end=start+1;
      while(end<lines.length && !/^\s*\[/.test(lines[end])) end++;
      let existing=-1;
      for(let i=start+1;i<end;i++)if(new RegExp(`^\\s*${setting}\\s*=`,"i").test(lines[i])) {existing=i;break;}
      if(existing>=0) lines[existing]=`${setting}=${value}`;
      else lines.splice(end>start+1 && !lines[end-1].trim()?end-1:end,0,`${setting}=${value}`);
    }
    return lines.join("\n");
  }
  function configure(conf,profile) {
    const p=normalize(profile);
    conf=option(conf,"cpu","cycles",p.cycles==="auto"||p.cycles==="max"?p.cycles:`fixed ${p.cycles}`);
    conf=option(conf,"sblaster","sbtype",p.sb);
    conf=option(conf,"sblaster","irq",p.irq);
    return conf;
  }
  const api=Object.freeze({KEYS,POSITIONS,DEFAULT_TOUCH,DEFAULT_GAMEPAD,defaults,normalize,configure});
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  if(root) root.RetroDosProfile=api;
})(typeof window!=="undefined"?window:null);

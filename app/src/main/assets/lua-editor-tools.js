"use strict";

// Pure, dependency-free Lua editor helpers. The highlighter is intentionally a
// lexer, not a Lua parser; it never executes source or diagnoses Lua semantics.
const luaKeywordSet = new Set(("and break do else elseif end false for function goto if in local nil not or repeat return then true until while").split(" "));
const luaEditorSuggestions = {
  "ui.": ["get(", "getAt(", "set(", "setAt(", "show(", "showModal(", "hide(", "unload(", "dialog(", "message(", "setItems(", "setColumns("],
  "files.": ["read(", "write(", "list(", "remove("],
  "store.": ["get(", "set(", "remove("],
  "db.": ["exec(", "query("],
  "math.": ["abs(", "ceil(", "floor(", "max(", "min(", "random(", "sqrt("],
  "string.": ["char(", "len(", "lower(", "reverse(", "sub(", "upper("],
  "": ["function", "local", "if", "then", "else", "elseif", "end", "for", "while", "do", "repeat", "until", "return", "print(", "tonumber(", "tostring(", "pairs(", "ipairs(", "ui.", "files.", "store.", "db."]
};
const luaEditorHintText = {
  "ui.get(": "ui.get(controlName, property[, formName]) → current value",
  "ui.set(": "ui.set(controlName, property, value[, formName])",
  "ui.dialog(": "ui.dialog(kind, title, prompt[, default]) — asynchronous Form_DialogResult",
  "ui.showModal(": "ui.showModal(formName) — disables other forms until closed",
  "files.read(": "files.read(filename) — response arrives in Form_FileResult",
  "files.write(": "files.write(filename, text) — sandboxed .txt, .csv or .json",
  "files.list(": "files.list() — response arrives in Form_FileResult",
  "store.get(": "store.get(key) — per-app saved setting",
  "store.set(": "store.set(key, value) — save a small setting",
  "db.exec(": "db.exec(sql, arg1, ...arg4) — parameterized SQL writes",
  "db.query(": "db.query(sql, arg1, ...arg4) — Form_DatabaseResult(event)"
};

function luaEscapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[char]);
}

function luaEditorTokens(source) {
  const chunks = [];
  const token = (type, raw) => chunks.push({type, text:raw});
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i, i + 256);
    const long = rest.match(/^(--)?\[(=*)\[/);
    if (rest.startsWith("--")) {
      const commentLong = rest.match(/^--\[(=*)\[/);
      if (commentLong) {
        const ending = "]" + commentLong[1] + "]";
        const at = source.indexOf(ending, i + commentLong[0].length);
        const end = at < 0 ? source.length : at + ending.length;
        token("comment", source.slice(i, end)); i = end; continue;
      }
      const at = source.indexOf("\n", i);
      const end = at < 0 ? source.length : at;
      token("comment", source.slice(i,end)); i = end; continue;
    }
    if (long && !long[1]) {
      const ending = "]" + long[2] + "]";
      const at = source.indexOf(ending, i + long[0].length);
      const end = at < 0 ? source.length : at + ending.length;
      token("string", source.slice(i,end)); i = end; continue;
    }
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i]; let j=i+1, closed=false;
      while(j < source.length && source[j] !== "\n") {
        if(source[j] === "\\") {j=Math.min(j+2,source.length); continue;}
        if(source[j] === quote) {j++;closed=true;break;}
        j++;
      }
      token(closed?"string":"error",source.slice(i,j));i=j;continue;
    }
    const number=rest.match(/^\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/);
    if(number) {token("number",number[0]);i+=number[0].length;continue;}
    const identifier=rest.match(/^[A-Za-z_][A-Za-z_0-9]*/);
    if(identifier) {token(luaKeywordSet.has(identifier[0])?"keyword":"plain",identifier[0]);i+=identifier[0].length;continue;}
    token("plain",source[i]);i++;
  }
  return chunks;
}

function luaHighlightSource(source) {
  return luaEditorTokens(source).map(t => t.type === "plain" ? luaEscapeHtml(t.text) :
    `<span class="lua-syn-${t.type}">${luaEscapeHtml(t.text)}</span>`).join("");
}

function luaSourceFunctions(source) {
  const functions=[];
  const matcher=/^[ \t]*(?:local\s+)?function\s+([A-Za-z_][A-Za-z0-9_:.]*)\s*\(/gm;
  let match;
  while ((match=matcher.exec(source)) && functions.length<120) {
    const prefix=source.slice(0,match.index);
    functions.push({name:match[1],line:prefix.split("\n").length,offset:match.index});
  }
  return functions;
}

function luaCompleteAt(source, caret, additional=[]) {
  const prefix=source.slice(0,Math.max(0,Math.min(caret,source.length)));
  const match=prefix.match(/(?:[A-Za-z_][\w]*\.)?[A-Za-z_\w]*$/);
  const typed=match?.[0]||"";
  const dot=typed.lastIndexOf(".");
  const receiver=dot>=0?typed.slice(0,dot+1):"";
  const fragment=dot>=0?typed.slice(dot+1):typed;
  if (!typed || (!receiver && fragment.length<2)) return {start:caret,items:[]};
  const candidates=[...(luaEditorSuggestions[receiver]||[]),...(receiver?[]:additional)];
  const items=[...new Set(candidates)].filter(word=>word.toLowerCase().startsWith(fragment.toLowerCase())&&word!==fragment).slice(0,12)
    .map(label=>({label,insert:receiver+label,detail:luaEditorHintText[receiver+label]||""}));
  return {start:caret-typed.length,items};
}

function luaSourceDiagnostics(source) {
  const diagnostics=[];
  // Only lexical diagnostics we can establish without LuaJ parsing. Full syntax
  // errors still come from the isolated runtime and its debugger.
  const pairs={")":"(","]":"[","}":"{"};
  const stack=[];
  let line=1;
  for(const t of luaEditorTokens(source)) {
    const old=line;
    if(t.type==="error") diagnostics.push({line:old,message:"Unterminated quoted string"});
    if(t.type==="plain") {
      for(const char of t.text){
        if("([{".includes(char)) stack.push({char,line});
        if(")]}".includes(char)) {
          if(!stack.length || stack.at(-1).char!==pairs[char]) diagnostics.push({line,message:"Unexpected closing delimiter " + char});
          else stack.pop();
        }
        if(char==="\n") line++;
      }
    } else line+=(t.text.match(/\n/g)||[]).length;
    if(diagnostics.length>10)break;
  }
  for (const entry of stack.slice(-8)) diagnostics.push({line:entry.line,message:"Unclosed delimiter " + entry.char});
  return diagnostics.slice(0,12);
}

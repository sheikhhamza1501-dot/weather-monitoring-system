const $ = s => document.querySelector(s);
const API = ""; // Served by Express on the same origin.
let locations = [], weather = [];
async function api(url, options = {}) {
  const response = await fetch(API + url, {headers:{"Content-Type":"application/json"}, ...options});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function esc(v){return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fmtDate(v){if(!v)return "—";const d=new Date(v);return isNaN(d) ? v : d.toLocaleString([], {year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"});}
function num(v,d=1){return v===null||v===undefined||v===""?"—":Number(v).toFixed(d);}
function banner(type,msg){const b=$("#banner");b.className="banner "+type;b.textContent=msg;$("#connection-label").textContent=type==="success"?"Connected to MySQL":type==="error"?"Connection problem":"Checking database…";$("#status-dot").style.background=type==="success"?"#40d58b":type==="error"?"#ff796b":"#f3bd4e";}
async function loadLocations(){
  locations=await api("/api/locations");
  $("#total-locations").textContent=locations.length;
  $("#location_id").innerHTML='<option value="">Select a location</option>'+locations.map(x=>`<option value="${x.location_id}">${esc(x.city)} — ${esc(x.location_name)}</option>`).join("");
  const old=$("#city-filter").value, cities=[...new Set(locations.map(x=>x.city))].sort();
  $("#city-filter").innerHTML='<option value="">All cities</option>'+cities.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if(cities.includes(old))$("#city-filter").value=old;
}
async function loadWeather(){
  weather=await api("/api/weather");
  $("#total-readings").textContent=weather.length;
  const temps=weather.map(x=>Number(x.temperature)).filter(Number.isFinite);
  $("#average-temperature").textContent=temps.length?(temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1)+"°":"—";
  $("#latest-humidity").textContent=weather[0]&&weather[0].humidity!=null?num(weather[0].humidity,0)+"%":"—";
  renderTable();
}
function renderTable(){
  const city=$("#city-filter").value, rows=city?weather.filter(x=>x.city?.toLowerCase()===city.toLowerCase()):weather;
  $("#record-count").textContent=`${rows.length} record${rows.length===1?"":"s"}`;
  $("#weather-table-body").innerHTML=rows.length?rows.map(x=>`<tr>
  <td class="city"><strong>${esc(x.city)}</strong><small>${esc(x.location_name)}</small></td><td>${esc(fmtDate(x.observation_time))}</td>
  <td><span class="temp">${num(x.temperature)} °C</span></td><td>${num(x.humidity,0)}%</td><td>${num(x.rainfall)} mm</td><td>${num(x.wind_speed)} km/h</td></tr>`).join(""):'<tr><td colspan="6">No observations found. Add a reading using the form.</td></tr>';
}
async function loadSummary(){
  const rows=await api("/api/weather/summary/average-temperature");
  const valid=rows.filter(x=>x.average_temperature!==null&&x.average_temperature!==undefined);
  const max=Math.max(1,...valid.map(x=>Number(x.average_temperature)));
  $("#temperature-bars").innerHTML=valid.length?valid.map(x=>`<div class="bar"><span>${esc(x.city)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,Number(x.average_temperature)/max*100)}%"></div></div><span class="bar-value">${num(x.average_temperature)}°</span></div>`).join(""):'<div style="text-align:center;color:#98a3b5;font-size:11px">No temperature data yet. Add a reading to see the summary.</div>';
}
async function refreshAll(){
  $("#refresh").disabled=true;$("#table-refresh").disabled=true;
  try{await api("/api/health");banner("success","Backend and MySQL connected successfully.");await loadLocations();await Promise.all([loadWeather(),loadSummary()]);}
  catch(e){banner("error",`Unable to load dashboard: ${e.message}. Check your backend terminal, .env settings, and API routes.`);}
  finally{$("#refresh").disabled=false;$("#table-refresh").disabled=false;}
}
function localDateTime(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);}
$("#observation_time").value=localDateTime();
$("#weather-form").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget, msg=$("#form-message"), btn=$("#submit-btn");msg.className="";msg.textContent="";
  const fd=new FormData(form), time=String(fd.get("observation_time"));
  const data={location_id:Number(fd.get("location_id")),observation_time:time.replace("T"," ")+":00",temperature:Number(fd.get("temperature")),humidity:Number(fd.get("humidity")),rainfall:Number(fd.get("rainfall")),wind_speed:Number(fd.get("wind_speed"))};
  if(!data.location_id||!time||![data.temperature,data.humidity,data.rainfall,data.wind_speed].every(Number.isFinite)){msg.className="error";msg.textContent="Please fill in all fields with valid numbers.";return;}
  if(data.humidity<0||data.humidity>100||data.rainfall<0||data.wind_speed<0){msg.className="error";msg.textContent="Humidity must be 0–100; rainfall and wind speed cannot be negative.";return;}
  btn.disabled=true;btn.textContent="Saving…";
  try{const result=await api("/api/weather",{method:"POST",body:JSON.stringify(data)});msg.className="success";msg.textContent=`${result.message} (ID: ${result.observation_id})`;form.reset();$("#observation_time").value=localDateTime();await Promise.all([loadWeather(),loadSummary()]);}
  catch(err){msg.className="error";msg.textContent=err.message;}
  finally{btn.disabled=false;btn.textContent="Save observation →";}
});
$("#city-filter").addEventListener("change",renderTable);
$("#refresh").addEventListener("click",refreshAll);
$("#table-refresh").addEventListener("click",async()=>{try{await Promise.all([loadWeather(),loadSummary()]);}catch(e){banner("error",e.message);}});
refreshAll();

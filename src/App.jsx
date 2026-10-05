import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ================================================================
// THE HUMANITY CODE -- Production Build (Supabase)
// Replace SUPABASE_URL and SUPABASE_KEY before deploying.
// ================================================================

var SUPABASE_URL = "https://jzktzqaboyqduptztrir.supabase.co";
var SUPABASE_KEY = "sb_publishable_Y26EbDjlzS8GfVtv4vuKlg_VsB4iKat";

// Design tokens
var INK      = "#1B2A4A";
var PAPER    = "#FAFAF8";
var GRAPHITE = "#6B7280";
var HAIRLINE = "#D8D6CF";
var FILL     = "#ECEAE3";
var SIGNAL   = "#B45309";
var GREEN    = "#2D6A4F";
var RED_DIM  = "#9B2335";
var SERIF    = "Georgia,serif";
var SANS     = "system-ui,-apple-system,sans-serif";

var pBtn = {
  appearance:"none", border:"1.5px solid "+INK, background:INK, color:PAPER,
  fontFamily:SANS, fontSize:12, fontWeight:700, letterSpacing:"0.14em",
  textTransform:"uppercase", padding:"15px 24px", cursor:"pointer",
  borderRadius:0, minHeight:48
};
var inp = {
  width:"100%", border:"1px solid "+HAIRLINE, background:"#fff", color:INK,
  fontFamily:SANS, fontSize:15, padding:"12px 14px", borderRadius:0
};

//  Supabase client 
function sbHeaders() {
  return { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY };
}

function sbGet(table, filters, select) {
  var url = SUPABASE_URL + "/rest/v1/" + table + "?select=" + (select || "*");
  if (filters) { url += "&" + filters; }
  return fetch(url, { headers: sbHeaders() })
    .then(function(r) { return r.json(); })
    .catch(function() { return []; });
}

function sbInsert(table, rows) {
  var body = Array.isArray(rows) ? rows : [rows];
  return fetch(SUPABASE_URL + "/rest/v1/" + table, {
    method: "POST",
    headers: Object.assign({}, sbHeaders(), {
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    }),
    body: JSON.stringify(body)
  }).then(function(r) { return r.ok ? null : "error"; })
    .catch(function() { return "network error"; });
}

function sbUpsert(table, rows, onConflict) {
  var body = Array.isArray(rows) ? rows : [rows];
  var url = SUPABASE_URL + "/rest/v1/" + table;
  if (onConflict) { url += "?on_conflict=" + onConflict; }
  return fetch(url, {
    method: "POST",
    headers: Object.assign({}, sbHeaders(), {
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=minimal"
    }),
    body: JSON.stringify(body)
  }).then(function(r) { return r.ok ? null : "error"; })
    .catch(function() { return "network error"; });
}

function sbCount(table) {
  return fetch(SUPABASE_URL + "/rest/v1/" + table + "?select=id", {
    headers: Object.assign({}, sbHeaders(), { "Prefer": "count=exact", "Range": "0-0" })
  }).then(function(r) {
    var cr = r.headers.get("Content-Range") || "0/0";
    return parseInt(cr.split("/")[1] || "0");
  }).catch(function() { return 0; });
}

function sbRpc(fn, params) {
  return fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: Object.assign({}, sbHeaders(), { "Content-Type": "application/json" }),
    body: JSON.stringify(params || {})
  }).then(function(r) { return r.ok ? r.json().catch(function() { return null; }) : null; })
    .catch(function() { return null; });
}

//  Session (localStorage) 
function sessionGet(k) {
  try { return JSON.parse(localStorage.getItem("hc_" + k)); } catch(e) { return null; }
}
function sessionSet(k, v) {
  try { localStorage.setItem("hc_" + k, JSON.stringify(v)); } catch(e) {}
}

//  Email hash (FNV-1a) 
function hashEmail(email) {
  var h = 2166136261;
  for (var i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

//  Social credits formula 
function calcCredits(dob) {
  if (!dob) return null;
  var ageFloor = Math.floor((Date.now() - new Date(dob).getTime()) / (1000*60*60*24*365.25));
  if (ageFloor < 4) return { creditsEarned:0, annualAllotment:0, status:"pending", eduPerformed:0, eduCredited:0, workHours:0, totalHours:0, pctComplete:0, inTrust:0 };
  var annualAllotment = ageFloor * 1000;
  var totalEarned = 1000 * (Math.floor(ageFloor * (ageFloor + 1) / 2) - 6);
  var inTrust = ageFloor < 22 ? Math.round(totalEarned * 0.5) : 0;
  var creditsEarned = totalEarned - inTrust;
  var status = ageFloor >= 70 ? "retired" : "active";
  var eduPerformed = 0, eduCredited = 0, workHours = 0;
  if (ageFloor < 22) {
    var sy = Math.min(ageFloor - 4, 18);
    eduPerformed = Math.min(Math.round(sy * 180 * 6), 20000);
    eduCredited = Math.min(eduPerformed * 2, 40000);
  } else {
    eduPerformed = 20000; eduCredited = 40000;
    workHours = Math.min(Math.round(Math.min(ageFloor - 22, 30) * 2000), 60000);
  }
  var totalHours = eduCredited + workHours;
  var pctComplete = Math.min(100, Math.round((totalHours / 100000) * 100));
  return { creditsEarned:creditsEarned, annualAllotment:annualAllotment, inTrust:inTrust,
           status:status, eduPerformed:eduPerformed, eduCredited:eduCredited,
           workHours:workHours, totalHours:totalHours, pctComplete:pctComplete };
}

//  Smart polling 
function useSmartPoll(fn, enabled) {
  var ref = useRef(null);
  var interval = useRef(5000);
  useEffect(function() {
    if (!enabled) return;
    function schedule() {
      ref.current = setTimeout(function() { fn(); schedule(); }, interval.current);
    }
    function onVis() { interval.current = document.hidden ? 30000 : 5000; }
    document.addEventListener("visibilitychange", onVis);
    fn(); schedule();
    return function() {
      clearTimeout(ref.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);
}

//  Shared UI 
function Eyebrow(props) {
  return React.createElement("div", {
    style: { fontFamily:SANS, fontSize:11, fontWeight:600, letterSpacing:"0.2em",
             textTransform:"uppercase", color:props.color || GRAPHITE }
  }, props.children);
}

function HR(props) {
  var mt = props.mt !== undefined ? props.mt : 24;
  var mb = props.mb !== undefined ? props.mb : 24;
  return React.createElement("div", {
    style: { height:1, background:HAIRLINE, margin:mt+"px 0 "+mb+"px" }
  });
}

function Btn(props) {
  return React.createElement("button", {
    onClick: props.onClick,
    disabled: props.disabled,
    style: Object.assign({}, pBtn, {
      opacity: props.disabled ? 0.4 : 1,
      cursor: props.disabled ? "not-allowed" : "pointer",
      background: props.bg || INK,
      borderColor: props.bg || INK
    })
  }, props.label);
}
const DEPARTMENTS = [
  { id:"social_economy", name:"Social Economy", short:"Social Economy",
    questions:["Should every citizen be guaranteed a home of a minimum size, whatever their Social Credit balance?","Should there be a limit on how many square feet of property any one person can own?","What should happen to a person's property when they die? A. Passes in full to heirs  B. Primary home to heirs, other property returns to community  C. Heirs keep it only if they live in it  D. All returns to community","Should volunteer work in the community count toward credited contribution hours?","Should empty homes and buildings be required to be put to use within a set time?","Should citizens earn credited hours for completing the Global Citizen Declaration each year?","Should citizens who move to a new region receive full Social Credit rights from their first day?","Should the 100,000-hour compact be reduced as automation increases?","Would you rather complete your hours at a gentler pace over a longer working life than work intensively and retire early?"],
    mandate:{ question:"What should be the primary focus of the Social Economy department",
      options:["Guaranteeing a basic standard of living for every citizen","Rewarding contribution and work hours over inherited wealth","Eliminating poverty as the system's first obligation","Ensuring every citizen's economic participation is transparent and equal"] },
  },
  { id:"environment", name:"Environment", short:"Environment",
    questions:["Should every person have the same yearly limit on the carbon emissions they cause?","Should animals and ecosystems have legal rights that can be defended in court?","Should products that cannot be recycled or composted be phased out?","Should every city be required to provide green space within walking distance of every home?","Should any citizen be able to bring a complaint against a polluter directly to the Environment department?","Should the Environment department be able to halt any project that threatens an endangered species?","Should companies be required to set aside Social Credits before starting any project that could damage the environment, to guarantee repair?","What should happen to communities in areas at high climate risk? A. Rebuild after each disaster  B. Rebuild stronger with protection  C. Offer residents support to move by choice  D. Stop rebuilding and move residents elsewhere","Should every household receive regular feedback on its waste compared with its neighbours?"],
    mandate:{ question:"What should be the primary focus of the Environment department",
      options:["Protecting Earth as a designated protected planet","Holding industry accountable for the full cost of environmental damage","Preserving permanent wild zones untouched by human development","Giving future generations legal standing in decisions made today"] },
  },
  { id:"agriculture", name:"Agriculture", short:"Agriculture",
    questions:["Should the world reduce meat production to free land and water for other uses?","Should limits be set on how much farmland any one company can control?","Should farm animals be guaranteed minimum standards of space and humane treatment?","Where should most of your food come from? A. My own region  B. Nearby regions  C. Wherever it is produced most efficiently worldwide  D. A mix: basic foods local, others from anywhere","Should every community have shared gardens where citizens can grow their own food?","Should schools teach every child to grow and cook food?","Should farmers be guaranteed a minimum price for what they grow?","Should lab-grown meat be developed as an alternative to farmed animals?","Should every region aim to grow enough food to feed itself in an emergency?"],
    mandate:{ question:"What should be the primary focus of the Agriculture department",
      options:["Eliminating hunger globally before addressing surplus","Protecting agricultural land from financial speculation","Ensuring every person has access to nutritionally adequate food","Coordinating global water use as a shared resource"] },
  },
  { id:"energy", name:"Energy", short:"Energy",
    questions:["Should every household receive a basic energy allowance, with higher prices only for use above it?","Which home would you choose? A. A small home in a busy neighbourhood near work and services  B. A medium home in a town with good public transport  C. A larger home in a suburb  D. A rural home with land","Should every new building be required to produce some of its own energy?","Should communities near new energy projects share in the benefits those projects produce?","Should citizens earn credited hours for producing energy at home and sharing it with neighbours?","Should every community be prepared to support itself for two weeks in an emergency, with trained citizen volunteers?","Should workers in closing fossil fuel industries be guaranteed full support until they are retrained?","Would you give up a private car if public and shared transport met your daily needs?","Should homes show residents their energy use in real time to help them save?"],
    mandate:{ question:"What should be the primary focus of the Energy department",
      options:["Transitioning away from fossil fuels within a defined timeline","Guaranteeing every household access to reliable electricity","Keeping energy infrastructure in collective rather than private ownership","Making energy research publicly funded and its findings publicly available"] },
  },
  { id:"industry", name:"Industry", short:"Industry",
    questions:["Should any one company be limited in how much of a market it can control?","Should every company be required to disclose working conditions throughout its supply chain?","Should advertising be limited for products that harm health, such as tobacco or junk food?","Should every citizen have the right to repair their own belongings, with access to parts and instructions?","How would you most like to work? A. Set hours at a workplace  B. Flexible hours at a workplace  C. Mostly from home  D. A mix of home and workplace","Should companies be required to give workers six months notice before large layoffs?","Should companies earn public recognition for outstanding treatment of workers and communities?","Should businesses owned by their workers or members receive priority support to grow?","Should all industries be required to reach zero waste by a set date?"],
    mandate:{ question:"What should be the primary focus of the Industry department",
      options:["Guaranteeing workers a share in the profits of the industries they build","Ensuring automation benefits all citizens, not just owners","Setting global minimum standards for labour conditions","Preventing essential goods industries from prioritising profit over access"] },
  },
  { id:"research", name:"Research & Development", short:"R&D",
    questions:["Should every citizen be able to take part in research as a citizen scientist and earn credited hours for it?","Should research on animals be phased out wherever alternatives exist?","How should research toward AI as capable as humans in every field proceed? A. As fast as possible  B. Continue, but only under strict global oversight  C. Pause until proven safe  D. Stop permanently","Should all research into new weapons be banned?","Should learning be free for every citizen at any age?","Should citizens be able to propose research questions for the department to fund?","Should promising research be stopped if an ethics panel judges the risks too great?","Should humanity actively search for life beyond Earth?","Should human brains ever be connected directly to computers?"],
    mandate:{ question:"What should be the primary focus of the Research & Development department",
      options:["Making publicly funded research available to all of humanity","Governing artificial intelligence under a global framework","Preventing existential risks through dedicated research investment","Treating knowledge as a shared human resource, not private property"] },
  },
  { id:"security", name:"Global Security", short:"Security",
    questions:["Should weapons that choose and attack targets without human control be banned?","What role should civic service play for young adults? A. A required year for everyone  B. Expected but voluntary, rewarded with credited hours  C. Voluntary with no special reward  D. No civic service programme","Should leaders who order a war crime face the same punishment as those who carry it out?","Should all service in the global security force be voluntary?","Should every citizen be trained in first aid and emergency response?","Should any surveillance by the security force require a judge's approval?","Should there be a public early-warning system that flags rising risk of conflict in any region?","Should neighbourhoods elect local mediators to settle disputes between neighbours before they escalate?","As national armies are disbanded, should former soldiers be guaranteed new roles and Social Credits?"],
    mandate:{ question:"What should be the primary focus of the Global Security department",
      options:["Replacing military conflict with binding global arbitration","Abolishing nuclear weapons under a verified global treaty","Protecting civilians from governments that commit crimes against them","Regulating the manufacture and sale of weapons under global authority"] },
  },
  { id:"health", name:"Health & Death Care", short:"Health",
    questions:["Should vaccination against serious contagious diseases be required, except for medical reasons?","Should tobacco, alcohol, and sugary drinks cost more to discourage harm?","Should every citizen be free to choose their own doctor, even if this means longer waits for popular doctors?","Should every citizen be guaranteed an appointment with a mental health professional within a set time?","How should organ donation decisions be made? A. Everyone is a donor unless they opt out  B. Every citizen records their choice when they first complete the GCD  C. Only people who sign up become donors  D. Families decide after death","Should doctors be allowed to refuse treatments that conflict with their personal beliefs?","Should citizens who actively maintain their health earn extra credited hours?","Should funeral and death care be provided free to every family?","Should genetic testing at birth be standard, unless parents decline?"],
    mandate:{ question:"What should be the primary focus of the Health & Death Care department",
      options:["Universal access to healthcare with no exceptions","Removing profit from life-saving medical treatments","Investing equally in mental health and physical health","Eradicating diseases that science already has the tools to eliminate"] },
  },
  { id:"entertainment", name:"Entertainment", short:"Entertainment",
    questions:["Should cultural and sporting events in public venues be free to attend?","Should a share of film, television, and music represent local languages and cultures?","Should professional sport and entertainment earn credited hours in the same way as other work?","Should gambling be allowed?","How much guaranteed free time should every citizen have each week? A. One day  B. Two days  C. Three days  D. No guarantee","Should online platforms be required to pay creators a set share of what they earn?","Should community art and events be funded mainly by local vote rather than by expert panels?","Should virtual spaces be governed by the same rules as public spaces in the real world?","Should a global holiday be created that every citizen shares?"],
    mandate:{ question:"What should be the primary focus of the Entertainment department",
      options:["Protecting public spaces and cultural infrastructure from privatisation","Compensating artists and cultural producers through the social economy","Guaranteeing every citizen paid time for rest and leisure","Holding media accountable for the spread of demonstrably false information"] },
  },
  { id:"telecom", name:"Telecommunications", short:"Telecom",
    questions:["Should people be allowed to use the internet anonymously?","From what age should children be allowed to use social media? A. No age limit, parents decide  B. 13  C. 16  D. 18","Should companies be banned from using personal data to target advertising?","Should citizens have the right to remove false or outdated information about themselves from the internet?","Should platforms be required to let users switch off algorithmic feeds and see content in time order?","Should any authority be able to order content removed from the internet without a court ruling?","Should facial recognition be banned in public spaces?","Should every citizen be taught to recognize false information and manipulation online?","Should AI assistants be required to put the user's wellbeing ahead of keeping them engaged?"],
    mandate:{ question:"What should be the primary focus of the Telecommunications department",
      options:["Universal access to the global communications network as a human right","Returning data ownership to the citizens it was collected from","Requiring algorithmic systems that shape public opinion to be transparent","Protecting the right to privacy in digital communications under global law"] },
  },
];

const ADVOCATE_NAMES = {
  social_economy: ["Amara Diallo","Chen Wei","Sofia Reyes","James Okafor"],
  environment:    ["Leila Ahmadi","Tariq Hassan","Priya Nair","Lucas Ferreira"],
  agriculture:    ["Maria Gonzalez","Kofi Asante","Yuki Tanaka","Fatima Al-Rashid"],
  energy:         ["Ravi Patel","Ingrid Larsen","Omar Sharif","Mei-Ling Chen"],
  industry:       ["Carlos Mendez","Aisha Nwosu","Henrik Berg","Ana Kovacs"],
  research:       ["Dr. Yuna Kim","Prof. David Osei","Dr. Sara Johansson","Dr. Ali Hassan"],
  security:       ["General Mia Torres","Admiral James Kwame","Col. Nadia Petrov","Gen. Samuel Park"],
  health:         ["Dr. Amina Bello","Dr. Raj Sharma","Dr. Elena Vasquez","Dr. Thomas Adeyemi"],
  entertainment:  ["Lena Muller","Marcus James","Chioma Eze","Hiroshi Nakamura"],
  telecom:        ["Zara Ahmed","Paulo Santos","Noa Cohen","Ananya Roy"],
};

const PEOPLES_ADVOCATE_CANDIDATES = [
  "Nelson Abara",
  "Isabelle Fontaine",
  "Kwame Mensah",
  "Valentina Cruz",
  "Dmitri Volkov",
  "Sunita Kapoor",
];
var LABELS = ["A","B","C","D"];

// ================================================================
// ROOT APP
// ================================================================
export default function App() {
  var s = useState("loading"); var stage = s[0]; var setStage = s[1];
  var m = useState(null); var me = m[0]; var setMe = m[1];
  var e = useState(""); var verifiedEmail = e[0]; var setEmail = e[1];
  var g = useState({}); var gcdAnswers = g[0]; var setGcdAnswers = g[1];
  var mn = useState({}); var mandates = mn[0]; var setMandates = mn[1];
  var av = useState({}); var advocateVotes = av[0]; var setAdvVotes = av[1];
  var pa = useState(null); var peoplesAdvocate = pa[0]; var setPA = pa[1];
  var tl = useState({}); var tallies = tl[0]; var setTallies = tl[1];
  var mt = useState({}); var mTallies = mt[0]; var setMTallies = mt[1];
  var pt = useState({}); var paTally = pt[0]; var setPATally = pt[1];
  var at = useState({}); var advTally = at[0]; var setAdvTally = at[1];
  var to = useState(0); var total = to[0]; var setTotal = to[1];
  var dv = useState(null); var deptView = dv[0]; var setDeptView = dv[1];
  var sm = useState(false); var showMap = sm[0]; var setShowMap = sm[1];
  var er = useState(null); var err = er[0]; var setErr = er[1];
  var lk = useState(false); var showLookup = lk[0]; var setShowLookup = lk[1];

  var refresh = useCallback(function() {
    sbGet("gcd_tallies", null, "dept_id,question_idx,yes_count,no_count").then(function(rows) {
      var next = {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        next[r.dept_id + ":" + r.question_idx] = { yes: r.yes_count, no: r.no_count };
      }
      setTallies(next);
    });
    sbGet("mandate_tallies", null, "dept_id,a_count,b_count,c_count,d_count").then(function(rows) {
      var mn2 = {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        mn2[r.dept_id] = { A:r.a_count, B:r.b_count, C:r.c_count, D:r.d_count };
      }
      setMTallies(mn2);
    });
    sbGet("peoples_advocate_tallies", null, "candidate,vote_count").then(function(rows) {
      var t = {};
      for (var i = 0; i < rows.length; i++) { t[rows[i].candidate] = rows[i].vote_count; }
      setPATally(t);
    });
    sbGet("advocate_tallies", null, "dept_id,candidate,vote_count").then(function(rows) {
      var t = {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!t[r.dept_id]) t[r.dept_id] = {};
        t[r.dept_id][r.candidate] = r.vote_count;
      }
      setAdvTally(t);
    });
    sbCount("citizens").then(function(n) { setTotal(n); });
  }, []);

  useSmartPoll(refresh, stage === "app");

  useEffect(function() {
    refresh();
    var saved = sessionGet("me");
    if (!saved || !saved.id) { setStage("landing"); return; }
    sbGet("citizens", "id=eq." + saved.id, "*").then(function(rows) {
      if (!rows || !rows[0]) { setStage("landing"); return; }
      var rec = rows[0];
      setMe(rec);
      setEmail(saved.email || "");
      sbGet("gcd_votes", "citizen_id=eq." + rec.id, "dept_id,question_idx,answer").then(function(rows) {
        var ans = {};
        for (var i = 0; i < rows.length; i++) {
          ans[rows[i].dept_id + ":" + rows[i].question_idx] = rows[i].answer;
        }
        setGcdAnswers(ans);
      });
      sbGet("mandate_votes", "citizen_id=eq." + rec.id, "dept_id,choice").then(function(rows) {
        var man = {};
        for (var i = 0; i < rows.length; i++) { man[rows[i].dept_id] = rows[i].choice; }
        setMandates(man);
      });
      sbGet("peoples_advocate_votes", "citizen_id=eq." + rec.id, "choice").then(function(rows) {
        if (rows && rows[0]) setPA(rows[0].choice);
      });
      sbGet("advocate_votes", "citizen_id=eq." + rec.id, "dept_id,choice").then(function(rows) {
        var adv = {};
        for (var i = 0; i < rows.length; i++) { adv[rows[i].dept_id] = rows[i].choice; }
        setAdvVotes(adv);
      });
      setStage("biometric");
    });
  }, []);

  function register(form) {
    sbCount("citizens").then(function(count) {
      var seq = count + 1;
      var socialId = "101-" + String(seq).padStart(10, "0");
      var id = "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      var rec = {
        id: id, social_id: socialId, email_hash: hashEmail(form.email || ""),
        name: form.name.trim(), dob: form.dob, region: form.region.trim()
        // email is NOT stored in database -- hash only
      };
      sbInsert("citizens", rec).then(function(err2) {
        if (err2) { setErr("Registration failed. Please try again."); return; }
        var meRec = { id:id, social_id:socialId, name:form.name.trim(), dob:form.dob, region:form.region.trim() };
        setMe(meRec);
        sessionSet("me", { id:id, email:form.email });
        setTotal(seq);
        setStage("biometric");
      });
    });
  }

  function commitGCD(ans) {
    var rows = [];
    var keys = Object.keys(ans);
    for (var i = 0; i < keys.length; i++) {
      var parts = keys[i].split(":");
      rows.push({ citizen_id:me.id, dept_id:parts[0], question_idx:parseInt(parts[1]), answer:ans[keys[i]] });
    }
    sbUpsert("gcd_votes", rows, "citizen_id,dept_id,question_idx").then(function() {
      var rpcCalls = [];
      for (var i = 0; i < keys.length; i++) {
        var parts = keys[i].split(":");
        rpcCalls.push(sbRpc("increment_gcd_tally", { p_dept_id:parts[0], p_question_idx:parseInt(parts[1]), p_answer:ans[keys[i]] }));
      }
      Promise.all(rpcCalls).then(function() {
        setGcdAnswers(ans);
        setStage("peoples_advocate");
      });
    });
  }

  function commitPA(choice) {
    sbUpsert("peoples_advocate_votes", { citizen_id:me.id, choice:choice }, "citizen_id").then(function() {
      sbRpc("increment_pa_tally", { p_candidate:choice }).then(function() {
        setPA(choice);
        setStage("commandments");
      });
    });
  }

  function commitMandates(man) {
    var rows = [];
    var keys = Object.keys(man);
    for (var i = 0; i < keys.length; i++) {
      rows.push({ citizen_id:me.id, dept_id:keys[i], choice:man[keys[i]] });
    }
    sbUpsert("mandate_votes", rows, "citizen_id,dept_id").then(function() {
      var rpcCalls = [];
      for (var i = 0; i < keys.length; i++) {
        rpcCalls.push(sbRpc("increment_mandate_tally", { p_dept_id:keys[i], p_choice:man[keys[i]] }));
      }
      Promise.all(rpcCalls).then(function() {
        setMandates(man);
        refresh();
        setStage("advocate");
      });
    });
  }

  function commitAdvocate(votes) {
    var deptIds = {};
    for (var i = 0; i < DEPARTMENTS.length; i++) { deptIds[DEPARTMENTS[i].id] = true; }
    var rows = [];
    var keys = Object.keys(votes);
    for (var i = 0; i < keys.length; i++) {
      if (deptIds[keys[i]]) { rows.push({ citizen_id:me.id, dept_id:keys[i], choice:votes[keys[i]] }); }
    }
    sbUpsert("advocate_votes", rows, "citizen_id,dept_id").then(function() {
      var rpcCalls = [];
      for (var i = 0; i < rows.length; i++) {
        rpcCalls.push(sbRpc("increment_advocate_tally", { p_dept_id:rows[i].dept_id, p_candidate:rows[i].choice }));
      }
      Promise.all(rpcCalls).then(function() {
        setAdvVotes(votes);
        refresh();
        setStage("app");
      });
    });
  }

  var gcdDone = Object.keys(gcdAnswers).length === 90;
  var mandateDone = Object.keys(mandates).length === 10;
  var declarationComplete = gcdDone && mandateDone;

  function majorityScore() {
    if (!gcdDone) return null;
    var s = 0;
    for (var di = 0; di < DEPARTMENTS.length; di++) {
      var dept = DEPARTMENTS[di];
      for (var qi = 0; qi < dept.questions.length; qi++) {
        var key = dept.id + ":" + qi;
        var my = gcdAnswers[key];
        var t = tallies[key] || { yes:0, no:0 };
        var tot = t.yes + t.no;
        if (!my || tot === 0) continue;
        if (my === (t.yes >= t.no ? "yes" : "no")) s++;
      }
    }
    return s;
  }

  var wrapStyle = {
    minHeight:"100vh", background:PAPER, color:INK, fontFamily:SANS,
    display:"flex", justifyContent:"center",
    padding:"clamp(20px,5vw,60px) 18px"
  };

  useEffect(function() {
    if (document.getElementById("hc-css")) return;
    var el = document.createElement("style");
    el.id = "hc-css";
    el.textContent = "*{box-sizing:border-box} button{cursor:pointer} " +
      ".fade{animation:hcf .35s ease both} " +
      "@keyframes hcf{from{opacity:0}to{opacity:1}} " +
      ".chov:hover{opacity:0.88} " +
      "@keyframes spin{to{transform:rotate(360deg)}} " +
      "@keyframes bpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}";
    document.head.appendChild(el);
    return function(){var e=document.getElementById("hc-css");if(e)e.remove();};
  }, []);

  return (
    <div style={wrapStyle}>

      <div style={{ width:"100%", maxWidth:660 }}>
        {err && (
          <div style={{ background:"#FEE2E2", border:"1px solid "+RED_DIM, padding:"12px 16px", marginBottom:16, fontFamily:SANS, fontSize:12, color:RED_DIM, display:"flex", justifyContent:"space-between" }}>
            <span>{err}</span>
            <button onClick={function(){setErr(null);}} style={{ appearance:"none", border:"none", background:"transparent", color:RED_DIM, fontSize:16, cursor:"pointer" }}>x</button>
          </div>
        )}
        {stage === "loading"          && <LoadingScreen/>}
        {stage === "landing"          && <LandingScreen onVerified={function(em){setEmail(em);setStage("tc");}}/>}
        {stage === "tc"               && <TCScreen onAccept={function(){setStage("register");}}/>}
        {stage === "register"         && <RegisterScreen onSubmit={register} email={verifiedEmail}/>}
        {stage === "biometric"        && <BiometricScreen me={me} onPass={function(){setStage(declarationComplete?"app":"gcd");}}/>}
        {stage === "gcd"              && <GCDScreen me={me} onComplete={commitGCD}/>}
        {stage === "peoples_advocate" && <PAScreen me={me} onComplete={commitPA}/>}
        {stage === "commandments"     && <CommandmentsScreen me={me} onComplete={commitMandates}/>}
        {stage === "advocate"         && <AdvocateScreen me={me} onComplete={commitAdvocate}/>}
        {showLookup && <LookupScreen onBack={function(){setShowLookup(false);}}/>}
        {!showLookup && stage === "app"              && (
          deptView
            ? <DeptViewScreen dept={DEPARTMENTS.filter(function(d){return d.id===deptView;})[0]} answers={gcdAnswers} tallies={tallies} onBack={function(){setDeptView(null);}}/>
            : <DashboardScreen
                me={me} total={total} answers={gcdAnswers} tallies={tallies}
                mandates={mandates} mTallies={mTallies} score={majorityScore()}
                declarationComplete={declarationComplete}
                onBeginDeclaration={function(){setStage("gcd");}}
                advocateVotes={advocateVotes} peoplesAdvocate={peoplesAdvocate}
                paTally={paTally} advTally={advTally} verifiedEmail={verifiedEmail}
                onDeptClick={setDeptView}
                onLookup={function(){setShowLookup(true);}}
              />
        )}
      </div>
    </div>
  );
}

// ================================================================
// SCREENS
// ================================================================

function LoadingScreen() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, color:GRAPHITE, fontFamily:SANS, fontSize:14, padding:"40px 0" }}>
      <div style={{ width:16, height:16, border:"2px solid "+HAIRLINE, borderTopColor:INK, borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
      Opening the registry...
    </div>
  );
}

function LandingScreen(props) {
  var em = useState(""); var email = em[0]; var setEmail = em[1];
  var cs = useState(""); var code = cs[0]; var setCode = cs[1];
  var sc = useState(""); var simCode = sc[0]; var setSimCode = sc[1];
  var ss = useState(false); var codeSent = ss[0]; var setCodeSent = ss[1];
  var sn = useState(false); var sending = sn[0]; var setSending = sn[1];
  var vd = useState(false); var verified = vd[0]; var setVerified = vd[1];
  var er = useState(""); var err = er[0]; var setErr = er[1];

  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  function sendCode() {
    if (!validEmail(email)) { setErr("Enter a valid email address."); return; }
    setSending(true); setErr("");
    setTimeout(function() {
      var c = String(Math.floor(100000 + Math.random() * 900000));
      setSimCode(c); setCodeSent(true); setSending(false);
    }, 1200);
  }

  function verify() {
    if (code.trim() === simCode) {
      setVerified(true);
      setTimeout(function() { props.onVerified(email); }, 700);
    } else {
      setErr("Incorrect code. Try again.");
    }
  }

  return (
    <div className="fade">
      <h1 style={{ fontFamily:SERIF, fontSize:"clamp(28px,6vw,42px)", fontWeight:700, margin:"0 0 6px", color:INK }}>The Humanity Code</h1>
      <Eyebrow>Global Citizen Registration</Eyebrow>
      <HR mt={20} mb={20}/>
      <p style={{ fontFamily:SERIF, fontSize:16, lineHeight:1.7, color:INK, margin:"0 0 28px", maxWidth:480 }}>
        The Humanity Code is a proposed global system of governance, economics, and citizenship. Register your voice in the global declaration and enter the social economy.
      </p>
      {!codeSent ? (
        <div>
          <div style={{ fontFamily:SANS, fontSize:11, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase", color:GRAPHITE, marginBottom:8 }}>Email address</div>
          <input style={inp} type="email" value={email} placeholder="your@email.com"
            onChange={function(e){setEmail(e.target.value);setErr("");}}/>
          <div style={{ fontFamily:SANS, fontSize:11, color:GRAPHITE, marginTop:6, marginBottom:20 }}>Verified and stored as a one-way hash only.</div>
          {err && <div style={{ color:SIGNAL, fontFamily:SANS, fontSize:12, marginBottom:12 }}>{err}</div>}
          <Btn onClick={sendCode} disabled={sending} label={sending ? "Sending..." : "Send verification code"}/>
        </div>
      ) : verified ? (
        <div style={{ fontFamily:SERIF, fontSize:18, color:GREEN, fontWeight:700 }}>Verified -- proceeding...</div>
      ) : (
        <div>
          <div style={{ border:"1px solid "+HAIRLINE, padding:"16px 18px", marginBottom:24, background:FILL }}>
            <div style={{ fontFamily:SANS, fontSize:11, fontWeight:600, color:GRAPHITE, marginBottom:6 }}>Code sent to {email}</div>
            <div style={{ fontFamily:SANS, fontSize:12, color:GRAPHITE, marginBottom:12 }}>For testing, your code is shown here:</div>
            <div style={{ fontFamily:SERIF, fontSize:32, fontWeight:700, color:INK, letterSpacing:"0.2em" }}>{simCode}</div>
          </div>
          <div style={{ fontFamily:SANS, fontSize:11, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase", color:GRAPHITE, marginBottom:8 }}>Enter 6-digit code</div>
          <input style={Object.assign({}, inp, { fontSize:24, letterSpacing:"0.2em", textAlign:"center", maxWidth:240 })}
            type="text" maxLength={6} value={code}
            onChange={function(e){setCode(e.target.value.replace(/\D/g,""));setErr("");}}/>
          {err && <div style={{ color:SIGNAL, fontFamily:SANS, fontSize:12, margin:"8px 0" }}>{err}</div>}
          <div style={{ marginTop:16, display:"flex", gap:16, alignItems:"center" }}>
            <Btn onClick={verify} disabled={code.length !== 6} label="Verify"/>
            <button onClick={function(){setCodeSent(false);setCode("");setErr("");}}
              style={{ appearance:"none", border:"none", background:"transparent", cursor:"pointer", fontFamily:SANS, fontSize:12, color:GRAPHITE, textDecoration:"underline" }}>
              Use different email
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TCScreen(props) {
  var ac = useState(false); var accepted = ac[0]; var setAccepted = ac[1];
  var sc = useState(false); var scrolled = sc[0]; var setScrolled = sc[1];
  var ref = useRef(null);

  function onScroll() {
    var el = ref.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setScrolled(true);
  }

  var depts = "Social Economy, Environment, Agriculture, Energy, Industry, Research and Development, Global Security, Health and Death Care, Entertainment, Telecommunications";

  return (
    <div className="fade">
      <h2 style={{ fontFamily:SERIF, fontSize:"clamp(22px,4.5vw,30px)", fontWeight:700, margin:"0 0 6px", color:INK }}>Terms and Conditions</h2>
      <Eyebrow>Read in full before accepting</Eyebrow>
      <HR mt={16} mb={16}/>
      <div ref={ref} onScroll={onScroll} style={{ border:"1px solid "+HAIRLINE, height:340, overflowY:"auto", padding:"20px 22px", background:PAPER, marginBottom:20, fontFamily:SERIF, fontSize:14, lineHeight:1.8, color:INK }}>
        <p style={{ fontWeight:700, fontSize:15, marginBottom:12 }}>Global Citizen Registration Agreement</p>
        <p>By completing registration as a Global Citizen under the Humanity Code, the registrant acknowledges and accepts that the Humanity Code operates under a ten-department governance structure -- {depts} -- which collectively and comprehensively address the full scope of human activity. Registration constitutes the registrant's formal acceptance of this structure as the basis for global governance under the Humanity Code.</p>
        <p style={{ fontWeight:700, marginTop:20, marginBottom:8 }}>1. Nature of Registration</p>
        <p>Registration is permanent and singular. Each human being may register once. Registration cannot be transferred, sold, duplicated, or revoked.</p>
        <p style={{ fontWeight:700, marginTop:20, marginBottom:8 }}>2. The Social Economy Contract</p>
        <p>The system owes every citizen a social credit allotment at the citizen's current age multiplied by one thousand credits per year. In return, the citizen owes one hundred thousand credited hours of contribution across their lifetime: forty thousand education hours and sixty thousand work hours.</p>
        <p style={{ fontWeight:700, marginTop:20, marginBottom:8 }}>3. The Ten-Department Structure</p>
        <p>The Humanity Code is administered through ten departments, each governing one domain of human activity by collective vote of all registered Global Citizens. No department operates outside its mandate.</p>
        <p style={{ fontWeight:700, marginTop:20, marginBottom:8 }}>4. The Global Citizen Declaration</p>
        <p>Upon registration, the citizen will complete 111 questions covering each department's mandate and priorities, plus the election of a People's Advocate. Answers are permanent and form part of the binding global majority.</p>
        <p style={{ fontWeight:700, marginTop:20, marginBottom:8 }}>5. Privacy and Data</p>
        <p>The system records name, date of birth, country, and a one-way hash of the email address. The original email is not retained after hashing. The system cannot be monetised or sold.</p>
        <p style={{ fontWeight:700, marginTop:20, marginBottom:8 }}>6. Majority Rule</p>
        <p>The Humanity Code operates on global majority rule: 50.01% governs on all matters. The outcome of the majority constitutes the legitimate governing mandate.</p>
        <p style={{ fontWeight:700, marginTop:20, marginBottom:8 }}>7. Acceptance</p>
        <p>By accepting these Terms and Conditions, the registrant confirms they have read and understood this agreement and are registering of their own free will.</p>
        <p style={{ marginTop:24, fontStyle:"italic", color:GRAPHITE }}>The Humanity Code -- Global Citizen Registration Agreement -- Version 1.0</p>
      </div>
      {!scrolled && <div style={{ fontFamily:SANS, fontSize:12, color:GRAPHITE, marginBottom:16, fontStyle:"italic" }}>Scroll to the bottom to accept.</div>}
      {scrolled && (
        <label style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:24, cursor:"pointer" }}>
          <input type="checkbox" checked={accepted} onChange={function(e){setAccepted(e.target.checked);}}
            style={{ width:18, height:18, marginTop:2, cursor:"pointer", flexShrink:0, accentColor:INK }}/>
          <span style={{ fontFamily:SERIF, fontSize:14, color:INK, lineHeight:1.6 }}>
            I have read and accept the Terms and Conditions. I understand my registration is permanent and constitutes formal acceptance of the ten-department governance structure.
          </span>
        </label>
      )}
      <Btn onClick={props.onAccept} disabled={!accepted} label="Accept and Register"/>
    </div>
  );
}

function RegisterScreen(props) {
  var nm = useState(""); var name = nm[0]; var setName = nm[1];
  var db = useState(""); var dob = db[0]; var setDob = db[1];
  var rg = useState(""); var region = rg[0]; var setRegion = rg[1];
  var er = useState(""); var err = er[0]; var setErr = er[1];

  function submit() {
    if (!name.trim()) { setErr("Enter your name."); return; }
    if (!dob) { setErr("Enter your date of birth."); return; }
    if (!region.trim()) { setErr("Enter your country or region."); return; }
    props.onSubmit({ name:name, dob:dob, region:region, email:props.email });
  }

  return (
    <div className="fade">
      <Eyebrow>Citizen Registration</Eyebrow>
      <h2 style={{ fontFamily:SERIF, fontSize:"clamp(22px,4vw,32px)", fontWeight:700, margin:"10px 0 6px", color:INK }}>Your record</h2>
      <p style={{ color:GRAPHITE, fontSize:13, margin:"0 0 24px", lineHeight:1.6 }}>Three things, once. Stored securely. Cannot be sold.</p>
      <div style={{ marginBottom:18 }}>
        <div style={{ fontFamily:SANS, fontSize:11, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase", color:GRAPHITE, marginBottom:7 }}>Email (verified)</div>
        <div style={{ padding:"12px 14px", background:FILL, color:GRAPHITE, fontStyle:"italic", fontFamily:SANS, fontSize:15 }}>{props.email || "--"}</div>
      </div>
      {[["Name","text","The name you want counted",name,setName],["Date of birth","date","",dob,setDob],["Country or region","text","Where you stand on the map",region,setRegion]].map(function(f) {
        return (
          <div key={f[0]} style={{ marginBottom:18 }}>
            <div style={{ fontFamily:SANS, fontSize:11, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase", color:GRAPHITE, marginBottom:7 }}>{f[0]}</div>
            <input style={inp} type={f[1]} value={f[3]} placeholder={f[2]}
              max={f[1]==="date" ? new Date().toISOString().slice(0,10) : undefined}
              onChange={function(ev){f[4](ev.target.value);setErr("");}}/>
          </div>
        );
      })}
      {err && <div style={{ color:SIGNAL, fontSize:12, marginBottom:12 }}>{err}</div>}
      <Btn onClick={submit} label="Register permanently"/>
    </div>
  );
}

function BiometricScreen(props) {
  var st = useState("idle"); var state = st[0]; var setState = st[1];

  useEffect(function() {
    if (state !== "scanning") return;
    var t = setTimeout(function() { setState("passed"); }, 2200);
    return function() { clearTimeout(t); };
  }, [state]);

  var ringStyle = {
    width:120, height:120, borderRadius:"50%",
    border:"2px solid " + (state==="passed" ? GREEN : state==="scanning" ? SIGNAL : HAIRLINE),
    display:"flex", alignItems:"center", justifyContent:"center",
    background:state==="passed" ? GREEN+"22" : state==="scanning" ? SIGNAL+"11" : FILL,
    position:"relative",
    animation: state==="scanning" ? "bpulse 1.2s ease-in-out infinite" : "none"
  };

  return (
    <div className="fade">
      <div style={{ fontFamily:SERIF, fontSize:15, fontWeight:700, color:INK, marginBottom:4 }}>The Humanity Code</div>
      <HR mt={4} mb={32}/>
      <Eyebrow>Identity Verification</Eyebrow>
      <h2 style={{ fontFamily:SERIF, fontSize:"clamp(22px,4.5vw,32px)", fontWeight:700, margin:"10px 0 8px", color:INK }}>
        {state === "passed" ? "Identity confirmed." : "Verify your identity"}
      </h2>
      <p style={{ fontFamily:SERIF, fontSize:16, lineHeight:1.65, color:INK, margin:"0 0 40px", maxWidth:480 }}>
        {state==="idle" && "Before accessing your account, the system requires biometric confirmation. Processed on-device only."}
        {state==="scanning" && "Scanning... Please hold still."}
        {state==="passed" && ("Welcome, " + (props.me && props.me.name ? props.me.name : "citizen") + ". Your identity has been confirmed.")}
      </p>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:44 }}>
        <div style={ringStyle}>
          {state==="idle" && <span style={{ fontSize:36 }}>&#9675;</span>}
          {state==="scanning" && <span style={{ fontFamily:SANS, fontSize:14, color:SIGNAL }}>...</span>}
          {state==="passed" && <span style={{ fontSize:36, color:GREEN }}>&#10003;</span>}
        </div>
        <div style={{ marginTop:20, fontFamily:SANS, fontSize:12, color:state==="passed" ? GREEN : GRAPHITE, fontWeight:state==="passed" ? 700 : 400 }}>
          {state==="idle" && "Touch ID - Face ID - Passcode"}
          {state==="passed" && "Verified"}
        </div>
      </div>
      {state==="idle" && <Btn onClick={function(){setState("scanning");}} label="Verify Identity"/>}
      {state==="scanning" && <Btn onClick={function(){}} disabled={true} label="Verifying..."/>}
      {state==="passed" && <Btn onClick={props.onPass} label="Enter my account" bg={GREEN}/>}
    </div>
  );
}

function GCDScreen(props) {
  var di = useState(0); var deptIdx = di[0]; var setDeptIdx = di[1];
  var qi = useState(0); var qIdx = qi[0]; var setQIdx = qi[1];
  var an = useState({}); var answers = an[0]; var setAnswers = an[1];
  var sl = useState(null); var selected = sl[0]; var setSelected = sl[1];
  var cm = useState(false); var committing = cm[0]; var setCommitting = cm[1];

  var dept = DEPARTMENTS[deptIdx];
  var answered = Object.keys(answers).length;
  var isLast = deptIdx === DEPARTMENTS.length-1 && qIdx === dept.questions.length-1;

  function advance(choice) {
    var key = dept.id + ":" + qIdx;
    var na = Object.assign({}, answers);
    na[key] = choice;
    setAnswers(na); setSelected(null);
    if (isLast) { setCommitting(true); props.onComplete(na); return; }
    if (qIdx < dept.questions.length-1) { setQIdx(function(q){return q+1;}); }
    else { setDeptIdx(function(d){return d+1;}); setQIdx(0); }
  }

  return (
    <div className="fade">
      <Eyebrow>Global Citizen Declaration</Eyebrow>
      <div style={{ fontFamily:SANS, fontSize:13, color:GRAPHITE, marginTop:4, marginBottom:16 }}>
        {props.me && props.me.name ? props.me.name : "Citizen"} -- 100 questions -- Yes / No
      </div>
      <div style={{ marginBottom:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{ fontFamily:SANS, fontSize:10, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase", color:GRAPHITE }}>Progress</span>
          <span style={{ fontFamily:SANS, fontSize:12, fontWeight:700, color:INK }}>{answered} / 100</span>
        </div>
        <div style={{ height:3, background:HAIRLINE, overflow:"hidden" }}>
          <div style={{ height:"100%", width:(Math.round(answered/90*100))+"%", background:INK, transition:"width 0.4s" }}/>
        </div>
      </div>
      <div style={{ background:FILL, padding:"14px 18px", marginBottom:24, display:"flex", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontFamily:SANS, fontSize:10, fontWeight:600, letterSpacing:"0.16em", textTransform:"uppercase", color:GRAPHITE, marginBottom:3 }}>Dept {String(deptIdx+1).padStart(2,"0")} of 10</div>
          <div style={{ fontFamily:SERIF, fontSize:16, fontWeight:700, color:INK }}>{dept.name}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:SANS, fontSize:10, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase", color:GRAPHITE, marginBottom:3 }}>Question</div>
          <div style={{ fontFamily:SANS, fontSize:18, fontWeight:700, color:SIGNAL }}>{qIdx+1}/10</div>
        </div>
      </div>
      <div style={{ fontFamily:SANS, fontSize:12, fontWeight:700, color:SIGNAL, marginBottom:12 }}>{String(answered+1).padStart(2,"0")}</div>
      <p style={{ fontFamily:SERIF, fontSize:"clamp(16px,3vw,19px)", lineHeight:1.6, color:INK, margin:"0 0 32px", fontWeight:500 }}>{dept.questions[qIdx]}</p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
        {["yes","no"].map(function(c) {
          var isSel = selected === c;
          return (
            <button key={c} onClick={function(){setSelected(c);}}
              style={{ appearance:"none", border:"1.5px solid "+(isSel?INK:HAIRLINE), background:isSel?INK:PAPER, color:isSel?PAPER:INK, fontFamily:SANS, fontSize:13, fontWeight:700, letterSpacing:"0.16em", textTransform:"uppercase", padding:"18px 0", cursor:"pointer", borderRadius:0, minHeight:56 }}>
              {c === "yes" ? "Yes" : "No"}
            </button>
          );
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontFamily:SANS, fontSize:12, color:selected?INK:GRAPHITE, fontStyle:selected?"normal":"italic" }}>
          {committing ? "Recording..." : selected ? ("You chose: " + (selected==="yes"?"Yes":"No")) : "Select Yes or No"}
        </div>
        <Btn onClick={function(){if(selected&&!committing)advance(selected);}} disabled={!selected||committing} label={isLast?"Submit":"Next"}/>
      </div>
    </div>
  );
}

function PAScreen(props) {
  var sl = useState(null); var selected = sl[0]; var setSelected = sl[1];
  var sb2 = useState(false); var submitting = sb2[0]; var setSubmitting = sb2[1];
  function submit() { if (!selected||submitting) return; setSubmitting(true); props.onComplete(selected); }
  return (
    <div className="fade">
      <Eyebrow>Question 111</Eyebrow>
      <h2 style={{ fontFamily:SERIF, fontSize:"clamp(22px,4vw,30px)", fontWeight:700, margin:"10px 0 8px", color:INK }}>The People's Advocate</h2>
      <p style={{ fontFamily:SANS, fontSize:13, color:GRAPHITE, margin:"0 0 24px", lineHeight:1.7, maxWidth:480 }}>One person represents the voice of all Global Citizens. Elected by the full citizen body.</p>
      <HR mt={0} mb={24}/>
      <p style={{ fontFamily:SERIF, fontSize:"clamp(17px,3.2vw,21px)", lineHeight:1.6, color:INK, margin:"0 0 28px", fontWeight:700 }}>Who should be the Global People's Advocate?</p>
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:28 }}>
        {PEOPLES_ADVOCATE_CANDIDATES.map(function(name) {
          var isSel = selected === name;
          return (
            <button key={name} onClick={function(){setSelected(name);}}
              style={{ appearance:"none", border:"1.5px solid "+(isSel?INK:HAIRLINE), background:isSel?INK:PAPER, color:isSel?PAPER:INK, fontFamily:SERIF, fontSize:16, fontWeight:isSel?700:400, textAlign:"left", padding:"16px 20px", cursor:"pointer", borderRadius:0 }}>
              {name}
            </button>
          );
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontFamily:SANS, fontSize:12, color:selected?INK:GRAPHITE, fontStyle:selected?"normal":"italic" }}>
          {submitting ? "Recording..." : selected ? ("Your vote: "+selected) : "Select the People's Advocate"}
        </div>
        <Btn onClick={submit} disabled={!selected||submitting} label="Next"/>
      </div>
    </div>
  );
}

function CommandmentsScreen(props) {
  var ix = useState(0); var idx = ix[0]; var setIdx = ix[1];
  var an = useState({}); var answers = an[0]; var setAnswers = an[1];
  var sl = useState(null); var selected = sl[0]; var setSelected = sl[1];
  var sb2 = useState(false); var submitting = sb2[0]; var setSubmitting = sb2[1];
  var dept = DEPARTMENTS[idx];
  var isLast = idx === DEPARTMENTS.length-1;
  function advance(choice) {
    var na = Object.assign({}, answers); na[dept.id] = choice;
    setAnswers(na); setSelected(null);
    if (isLast) { setSubmitting(true); props.onComplete(na); return; }
    setIdx(function(i){return i+1;});
  }
  return (
    <div className="fade">
      <Eyebrow>The 10 Commandments</Eyebrow>
      <div style={{ fontFamily:SANS, fontSize:13, color:GRAPHITE, marginTop:4, marginBottom:16 }}>Choose the primary mandate for each department</div>
      <div style={{ marginBottom:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{ fontFamily:SANS, fontSize:10, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase", color:GRAPHITE }}>Progress</span>
          <span style={{ fontFamily:SANS, fontSize:12, fontWeight:700, color:INK }}>{Object.keys(answers).length} / 10</span>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {DEPARTMENTS.map(function(d,i) {
            var done = Object.keys(answers).length;
            return <div key={d.id} style={{ flex:1, height:i<done?4:2, background:i<done?INK:HAIRLINE, transition:"height 0.2s" }}/>;
          })}
        </div>
      </div>
      <div style={{ background:FILL, padding:"12px 18px", marginBottom:24 }}>
        <div style={{ fontFamily:SANS, fontSize:10, fontWeight:600, letterSpacing:"0.16em", textTransform:"uppercase", color:GRAPHITE, marginBottom:3 }}>Commandment {String(idx+1).padStart(2,"0")} of 10</div>
        <div style={{ fontFamily:SERIF, fontSize:16, fontWeight:700, color:INK }}>{dept.name}</div>
      </div>
      <p style={{ fontFamily:SERIF, fontSize:"clamp(16px,3vw,19px)", lineHeight:1.6, color:INK, margin:"0 0 24px", fontWeight:700 }}>{dept.mandate.question}</p>
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
        {dept.mandate.options.map(function(opt,oi) {
          var label = LABELS[oi]; var isSel = selected === label;
          return (
            <button key={label} onClick={function(){setSelected(label);}}
              style={{ appearance:"none", border:"1.5px solid "+(isSel?INK:HAIRLINE), background:isSel?INK:PAPER, color:isSel?PAPER:INK, fontFamily:SANS, fontSize:13, fontWeight:isSel?700:400, textAlign:"left", padding:"14px 16px", cursor:"pointer", borderRadius:0, display:"flex", gap:12 }}>
              <span style={{ fontWeight:700, flexShrink:0, color:isSel?PAPER:SIGNAL }}>{label}.</span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontFamily:SANS, fontSize:12, color:selected?INK:GRAPHITE, fontStyle:selected?"normal":"italic" }}>
          {submitting ? "Recording..." : selected ? ("Selected: "+selected) : "Choose your priority"}
        </div>
        <Btn onClick={function(){if(selected&&!submitting)advance(selected);}} disabled={!selected||submitting} label={isLast?"Complete":"Next"}/>
      </div>
    </div>
  );
}

function AdvocateScreen(props) {
  var ix = useState(0); var idx = ix[0]; var setIdx = ix[1];
  var an = useState({}); var answers = an[0]; var setAnswers = an[1];
  var sl = useState(null); var selected = sl[0]; var setSelected = sl[1];
  var sb2 = useState(false); var submitting = sb2[0]; var setSubmitting = sb2[1];
  var dept = DEPARTMENTS[idx];
  var names = ADVOCATE_NAMES[dept && dept.id] || [];
  var isLast = idx === DEPARTMENTS.length-1;
  function advance(choice) {
    var na = Object.assign({}, answers); na[dept.id] = choice;
    setAnswers(na); setSelected(null);
    if (isLast) { setSubmitting(true); props.onComplete(na); return; }
    setIdx(function(i){return i+1;});
  }
  return (
    <div className="fade">
      <Eyebrow>Advocate Election</Eyebrow>
      <h2 style={{ fontFamily:SERIF, fontSize:"clamp(22px,4vw,30px)", fontWeight:700, margin:"10px 0 6px", color:INK }}>Who should advocate?</h2>
      <div style={{ marginBottom:24 }}>
        <div style={{ display:"flex", gap:4 }}>
          {DEPARTMENTS.map(function(d,i) {
            var done = Object.keys(answers).length;
            return <div key={d.id} style={{ flex:1, height:i<done?4:2, background:i<done?INK:HAIRLINE, transition:"height 0.2s" }}/>;
          })}
        </div>
      </div>
      <div style={{ background:FILL, padding:"12px 18px", marginBottom:24 }}>
        <div style={{ fontFamily:SANS, fontSize:10, fontWeight:600, letterSpacing:"0.16em", textTransform:"uppercase", color:GRAPHITE, marginBottom:3 }}>Department {String(idx+1).padStart(2,"0")} of 10</div>
        <div style={{ fontFamily:SERIF, fontSize:16, fontWeight:700, color:INK }}>{dept && dept.name}</div>
      </div>
      <p style={{ fontFamily:SERIF, fontSize:"clamp(16px,3vw,19px)", lineHeight:1.6, color:INK, margin:"0 0 24px", fontWeight:700 }}>Who should be the {dept && dept.name} Advocate?</p>
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
        {names.map(function(name) {
          var isSel = selected === name;
          return (
            <button key={name} onClick={function(){setSelected(name);}}
              style={{ appearance:"none", border:"1.5px solid "+(isSel?INK:HAIRLINE), background:isSel?INK:PAPER, color:isSel?PAPER:INK, fontFamily:SERIF, fontSize:15, fontWeight:isSel?700:400, textAlign:"left", padding:"14px 18px", cursor:"pointer", borderRadius:0 }}>
              {name}
            </button>
          );
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontFamily:SANS, fontSize:12, color:selected?INK:GRAPHITE, fontStyle:selected?"normal":"italic" }}>
          {submitting ? "Recording..." : selected ? ("Your vote: "+selected) : "Select an advocate"}
        </div>
        <Btn onClick={function(){if(selected&&!submitting)advance(selected);}} disabled={!selected||submitting} label={isLast?"Complete":"Next"}/>
      </div>
    </div>
  );
}

function DashboardScreen(props) {
  // props.onLookup - opens public vote lookup
  var credits = useMemo(function(){return calcCredits(props.me && props.me.dob);}, [props.me && props.me.dob]);
  var age = props.me && props.me.dob ? Math.floor((Date.now()-new Date(props.me.dob).getTime())/(1000*60*60*24*365.25)) : null;

  var profileRows = [
    ["Social ID",    props.me && props.me.social_id ? props.me.social_id : "--"],
    ["Email",        props.verifiedEmail || "--"],
    ["Name",         props.me && props.me.name ? props.me.name : "--"],
    ["Age",          age ? age+" years old" : "--"],
    ["Date of birth",props.me && props.me.dob ? props.me.dob : "--"],
    ["Region",       props.me && props.me.region ? props.me.region : "--"],
    ["Declaration",  props.declarationComplete ? "Complete - 111 questions" : "Pending"]
  ];

  return (
    <div className="fade">
      <h1 style={{ fontFamily:SERIF, fontSize:"clamp(24px,5vw,36px)", fontWeight:700, margin:"0 0 4px", color:INK }}>The Humanity Code</h1>
      <Eyebrow>Global Citizen Platform</Eyebrow>
      <div style={{ marginTop:8, marginBottom:16, display:"flex", justifyContent:"flex-end" }}>
        <button onClick={props.onLookup}
          style={{ appearance:"none", border:"1px solid "+HAIRLINE, background:"transparent", cursor:"pointer", fontFamily:SANS, fontSize:11, fontWeight:600, color:GRAPHITE, padding:"7px 14px", letterSpacing:"0.08em", textTransform:"uppercase" }}>
          Look up a citizen by Social ID
        </button>
      </div>
      <HR mt={0} mb={16}/>

      <div style={{ border:"1px solid "+HAIRLINE, marginBottom:16, overflow:"hidden" }}>
        <div style={{ background:INK, padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <Eyebrow color="rgba(255,255,255,0.6)">Citizen Record</Eyebrow>
          <div style={{ fontFamily:SERIF, fontSize:14, fontWeight:700, color:PAPER }}>{props.total.toLocaleString()} registered</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", background:PAPER }}>
          {profileRows.map(function(row, i) {
            return (
              <div key={row[0]} style={{ padding:"9px 14px", borderTop:"1px solid "+HAIRLINE, borderRight:i%2===0?"1px solid "+HAIRLINE:"none" }}>
                <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:GRAPHITE, marginBottom:2 }}>{row[0]}</div>
                <div style={{ fontFamily:SERIF, fontSize:12, color:row[1]==="Pending"||row[1]==="--"?GRAPHITE:INK, fontStyle:row[1]==="Pending"?"italic":"normal" }}>{row[1]}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
        <div style={{ background:INK, padding:"14px 16px" }}>
          <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase", color:"rgba(255,255,255,0.45)", marginBottom:6 }}>Majority Score</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
            <span style={{ fontFamily:SERIF, fontSize:36, fontWeight:700, color:props.score===null?"rgba(255,255,255,0.2)":PAPER, lineHeight:1 }}>{props.score===null?"--":props.score}</span>
            <span style={{ fontFamily:SERIF, fontSize:16, color:"rgba(255,255,255,0.3)" }}>/100</span>
          </div>
          <div style={{ fontFamily:SANS, fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:5 }}>
            {props.score===null ? "Complete Declaration to see score" : "vs global majority"}
          </div>
        </div>
        <div style={{ background:INK, padding:"14px 16px" }}>
          <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase", color:"rgba(255,255,255,0.45)", marginBottom:6 }}>Social Credits</div>
          {credits ? (
            <div>
              <div style={{ fontFamily:SERIF, fontSize:"clamp(22px,5vw,32px)", fontWeight:700, color:PAPER, lineHeight:1, marginBottom:4 }}>{credits.creditsEarned.toLocaleString()}</div>
              <div style={{ fontFamily:SANS, fontSize:10, color:"rgba(255,255,255,0.45)" }}>{credits.annualAllotment.toLocaleString()} SC/yr</div>
              {credits.inTrust > 0 && <div style={{ fontFamily:SANS, fontSize:9, color:"rgba(255,255,255,0.35)", marginTop:2 }}>{credits.inTrust.toLocaleString()} in trust</div>}
              <div style={{ fontFamily:SANS, fontSize:9, fontWeight:700, color:SIGNAL, marginTop:5, letterSpacing:"0.1em", textTransform:"uppercase" }}>{credits.status}</div>
            </div>
          ) : (
            <div style={{ fontFamily:SANS, fontSize:12, color:"rgba(255,255,255,0.3)", fontStyle:"italic" }}>Enter DOB to calculate</div>
          )}
        </div>
      </div>

      {credits && credits.status !== "pending" && (
        <div style={{ border:"1px solid "+HAIRLINE, padding:"14px 16px", marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12 }}>
            <Eyebrow>Hours Performed to Date</Eyebrow>
            <span style={{ fontFamily:SANS, fontSize:11, fontWeight:700, color:credits.pctComplete===100?GREEN:INK }}>{credits.totalHours.toLocaleString()} / 100,000 -- {credits.pctComplete}%</span>
          </div>
          {[
            { label:"Education", performed:credits.eduPerformed, credited:credits.eduCredited, total:40000, rate:"2-for-1", complete:credits.eduCredited>=40000 },
            { label:"Work",      performed:credits.workHours,    credited:credits.workHours,    total:60000, rate:"1-for-1", complete:credits.workHours>=60000 }
          ].map(function(row) {
            return (
              <div key={row.label} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontFamily:SANS, fontSize:10, fontWeight:600, color:INK }}>{row.label}{row.complete ? " (Complete)" : ""}</span>
                  <span style={{ fontFamily:SANS, fontSize:10, color:GRAPHITE }}>{row.performed.toLocaleString()} hrs</span>
                </div>
                <div style={{ height:3, background:FILL, overflow:"hidden", marginBottom:3 }}>
                  <div style={{ height:"100%", width:Math.min(100,(row.credited/row.total)*100)+"%", background:row.complete?GREEN:INK, transition:"width 0.5s" }}/>
                </div>
                <div style={{ fontFamily:SANS, fontSize:10, color:GRAPHITE }}>{row.credited.toLocaleString()} / {row.total.toLocaleString()} credited -- {row.rate}</div>
              </div>
            );
          })}
        </div>
      )}

      {!props.declarationComplete && (
        <div style={{ border:"1.5px solid "+SIGNAL, padding:"20px 22px", marginBottom:24, background:SIGNAL+"0A" }}>
          <div style={{ fontFamily:SANS, fontSize:11, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:SIGNAL, marginBottom:8 }}>Your Declaration is waiting</div>
          <p style={{ fontFamily:SERIF, fontSize:16, lineHeight:1.6, color:INK, margin:"0 0 18px" }}>Complete your 111-question Global Citizen Declaration to record your voice and see where you stand with the rest of humanity.</p>
          <Btn onClick={props.onBeginDeclaration} label="Begin Declaration"/>
        </div>
      )}

      {props.declarationComplete && (
        <DeclarationSummary
          answers={props.answers} tallies={props.tallies}
          mandates={props.mandates} mTallies={props.mTallies}
          advocateVotes={props.advocateVotes} peoplesAdvocate={props.peoplesAdvocate}
          paTally={props.paTally} advTally={props.advTally}
          onDeptClick={props.onDeptClick}
        />
      )}

      <GlobalResults tallies={props.tallies} declarationComplete={props.declarationComplete}/>
    </div>
  );
}

function DeclarationSummary(props) {
  var totalMatch = 0, totalQ = 0;
  for (var di = 0; di < DEPARTMENTS.length; di++) {
    var dept = DEPARTMENTS[di];
    for (var qi = 0; qi < dept.questions.length; qi++) {
      var key = dept.id + ":" + qi;
      var my = props.answers[key];
      var t = props.tallies[key] || { yes:0, no:0 };
      var tot = t.yes + t.no;
      if (!my || tot === 0) continue;
      if (my === (t.yes >= t.no ? "yes" : "no")) totalMatch++;
      totalQ++;
    }
  }

  return (
    <div style={{ marginBottom:24 }}>
      <Eyebrow>Your Declaration</Eyebrow>
      <div style={{ background:INK, padding:"14px 16px", marginTop:12, marginBottom:12 }}>
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", marginBottom:14, paddingBottom:14, borderBottom:"1px solid rgba(255,255,255,0.12)" }}>
          {[["GCD Match",totalMatch+"/"+totalQ],["Mandates",Object.keys(props.mandates).length+"/10"],["Advocates",DEPARTMENTS.filter(function(d){return props.advocateVotes[d.id];}).length+"/10"]].map(function(item) {
            return (
              <div key={item[0]}>
                <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(255,255,255,0.45)", marginBottom:3 }}>{item[0]}</div>
                <div style={{ fontFamily:SERIF, fontSize:18, fontWeight:700, color:PAPER }}>{item[1]}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.16em", textTransform:"uppercase", color:"rgba(255,255,255,0.45)", marginBottom:6 }}>People's Advocate -- Q111</div>
        <div style={{ fontFamily:SERIF, fontSize:13, fontWeight:700, color:props.peoplesAdvocate?PAPER:"rgba(255,255,255,0.3)" }}>{props.peoplesAdvocate || "Not yet voted"}</div>
        {props.paTally && props.peoplesAdvocate && props.paTally[props.peoplesAdvocate] && (
          <div style={{ fontFamily:SANS, fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:2 }}>{props.paTally[props.peoplesAdvocate].toLocaleString()} votes</div>
        )}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {DEPARTMENTS.map(function(dept, di) {
          var deptMatch = 0;
          for (var qi = 0; qi < dept.questions.length; qi++) {
            var key = dept.id+":"+qi;
            var my = props.answers[key];
            var t = props.tallies[key] || {yes:0,no:0};
            if (my && (t.yes+t.no)>0 && my===(t.yes>=t.no?"yes":"no")) deptMatch++;
          }
          var myMan = props.mandates[dept.id];
          var mt = props.mTallies[dept.id] || {A:0,B:0,C:0,D:0};
          var mtKeys = Object.keys(mt);
          var globalMand = mtKeys.length ? mtKeys.reduce(function(a,b){return mt[a]>mt[b]?a:b;}) : null;
          var mandMatch = myMan && globalMand && myMan === globalMand;
          var myAdv = props.advocateVotes[dept.id];
          var isDark = [1,2,5,6,9].indexOf(di) !== -1;
          var scoreColor = deptMatch>=7?GREEN:deptMatch>=4?SIGNAL:RED_DIM;
          return (
            <div key={dept.id} className="chov" onClick={function(){props.onDeptClick(dept.id);}}
              style={{ background:isDark?INK:PAPER, border:"1px solid "+(isDark?INK:HAIRLINE), cursor:"pointer", display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <div style={{ height:3, background:deptMatch>=7?GREEN:deptMatch>=4?SIGNAL:HAIRLINE, flexShrink:0 }}/>
              <div style={{ padding:"14px 14px 12px", flex:1, display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.16em", textTransform:"uppercase", color:isDark?"rgba(255,255,255,0.5)":GRAPHITE }}>{String(di+1).padStart(2,"0")}</div>
                <div style={{ fontFamily:SERIF, fontSize:"clamp(14px,2.6vw,18px)", fontWeight:700, color:isDark?PAPER:INK, lineHeight:1.2, flex:1 }}>{dept.name}</div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
                  <div>
                    <div style={{ fontFamily:SANS, fontSize:8, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", color:isDark?"rgba(255,255,255,0.5)":GRAPHITE, marginBottom:2 }}>GCD</div>
                    <div style={{ fontFamily:SERIF, fontSize:22, fontWeight:700, color:scoreColor, lineHeight:1 }}>
                      {deptMatch}<span style={{ fontFamily:SANS, fontSize:10, color:isDark?"rgba(255,255,255,0.5)":GRAPHITE, fontWeight:400 }}>/10</span>
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    {myMan && <div style={{ fontFamily:SANS, fontSize:9, color:mandMatch?(isDark?"#6EE7B7":GREEN):(isDark?"#FCA5A5":RED_DIM), fontWeight:600, marginBottom:2 }}>{myMan} {mandMatch?"v":"x"}</div>}
                    {myAdv && <div style={{ fontFamily:SANS, fontSize:9, color:isDark?"rgba(255,255,255,0.6)":GRAPHITE, fontWeight:600 }}>{myAdv.split(" ").pop()}</div>}
                    {!myMan && !myAdv && <div style={{ fontFamily:SANS, fontSize:9, color:isDark?"rgba(255,255,255,0.4)":GRAPHITE, fontStyle:"italic" }}>Pending</div>}
                  </div>
                </div>
                <div style={{ fontFamily:SANS, fontSize:9, color:isDark?"rgba(255,255,255,0.4)":GRAPHITE, borderTop:"1px solid "+(isDark?"rgba(255,255,255,0.1)":FILL), paddingTop:8 }}>Tap to expand</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GlobalResults(props) {
  if (!props.declarationComplete) return null;
  var yes = 0, no = 0;
  var keys = Object.keys(props.tallies);
  for (var i = 0; i < keys.length; i++) {
    var t = props.tallies[keys[i]];
    yes += t.yes; no += t.no;
  }
  var tot = yes + no;
  if (tot === 0) return (
    <div style={{ border:"1px solid "+HAIRLINE, padding:"20px 22px", marginBottom:16, textAlign:"center" }}>
      <Eyebrow>Live Global Results</Eyebrow>
      <p style={{ fontFamily:SERIF, fontSize:15, color:GRAPHITE, fontStyle:"italic", marginTop:12 }}>No global votes recorded yet.</p>
    </div>
  );
  var yesPct = Math.round((yes/tot)*100);
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:14 }}>
        <Eyebrow>Live Global Results</Eyebrow>
        <span style={{ fontFamily:SANS, fontSize:11, color:GRAPHITE }}>{tot.toLocaleString()} votes</span>
      </div>
      <div style={{ height:8, background:FILL, overflow:"hidden", marginBottom:8 }}>
        <div style={{ height:"100%", width:yesPct+"%", background:INK, transition:"width 0.6s" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontFamily:SANS, fontSize:12, color:GRAPHITE }}>
        <span style={{ color:INK, fontWeight:700 }}>Yes {yesPct}%</span>
        <span>No {100-yesPct}%</span>
      </div>
    </div>
  );
}

function DeptViewScreen(props) {
  if (!props.dept) return null;
  return (
    <div className="fade">
      <button onClick={props.onBack} style={{ appearance:"none", border:"none", background:"transparent", cursor:"pointer", fontFamily:SANS, fontSize:13, color:GRAPHITE, padding:"0 0 18px" }}>Back</button>
      <Eyebrow>Global Citizen Declaration</Eyebrow>
      <h2 style={{ fontFamily:SERIF, fontSize:"clamp(18px,4vw,26px)", fontWeight:700, margin:"8px 0 24px", color:INK }}>{props.dept.name}</h2>
      {props.dept.questions.map(function(q, qi) {
        var key = props.dept.id+":"+qi;
        var my = props.answers[key];
        var t = props.tallies[key] || {yes:0,no:0};
        var tot = t.yes+t.no;
        var yesPct = tot ? Math.round((t.yes/tot)*100) : 0;
        var maj = tot ? (t.yes>=t.no?"yes":"no") : null;
        var inMaj = my && maj && my===maj;
        return (
          <div key={qi} style={{ borderTop:"1px solid "+HAIRLINE, paddingTop:18, marginBottom:18 }}>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <div style={{ fontFamily:SANS, fontSize:10, fontWeight:700, color:SIGNAL, flexShrink:0, marginTop:2 }}>{String(qi+1).padStart(2,"0")}</div>
              <p style={{ fontFamily:SERIF, fontSize:"clamp(14px,2.5vw,16px)", lineHeight:1.6, color:INK, margin:0 }}>{q}</p>
            </div>
            {my && (
              <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:inMaj?GREEN+"12":FILL, padding:"4px 10px", marginBottom:10, border:"1px solid "+(inMaj?GREEN:HAIRLINE) }}>
                <span style={{ fontFamily:SANS, fontSize:9, fontWeight:700, textTransform:"uppercase", color:inMaj?GREEN:GRAPHITE }}>Your vote</span>
                <span style={{ fontFamily:SERIF, fontSize:13, fontWeight:700, color:inMaj?GREEN:INK }}>{my==="yes"?"Yes":"No"}</span>
                {inMaj && <span style={{ fontFamily:SANS, fontSize:9, color:GREEN, fontWeight:700 }}>Majority</span>}
              </div>
            )}
            {tot > 0 ? (
              <div>
                <div style={{ display:"flex", gap:16, marginBottom:8, alignItems:"flex-end" }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontFamily:SERIF, fontSize:maj==="yes"?22:15, fontWeight:700, color:maj==="yes"?INK:GRAPHITE, lineHeight:1 }}>{t.yes.toLocaleString()}</div>
                    <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", color:maj==="yes"?INK:GRAPHITE, marginTop:2 }}>Yes {maj==="yes"?"*":""}</div>
                  </div>
                  <div style={{ flex:1, display:"flex", height:4, background:FILL, overflow:"hidden", alignSelf:"center" }}>
                    <div style={{ width:yesPct+"%", background:INK }}/>
                    <div style={{ width:(100-yesPct)+"%", background:GRAPHITE, opacity:0.3 }}/>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontFamily:SERIF, fontSize:maj==="no"?22:15, fontWeight:700, color:maj==="no"?INK:GRAPHITE, lineHeight:1 }}>{t.no.toLocaleString()}</div>
                    <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", color:maj==="no"?INK:GRAPHITE, marginTop:2 }}>No {maj==="no"?"*":""}</div>
                  </div>
                </div>
                <div style={{ fontFamily:SANS, fontSize:10, color:SIGNAL, textAlign:"right" }}>{tot.toLocaleString()} total votes</div>
              </div>
            ) : (
              <div style={{ fontFamily:SANS, fontSize:11, color:GRAPHITE, fontStyle:"italic" }}>No votes yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ================================================================
// PUBLIC CITIZEN LOOKUP SCREEN
// Looks up any citizen's votes by Social ID only.
// No personal information (name, email, DOB) is ever shown.
// ================================================================
function LookupScreen(props) {
  var si = useState(""); var socialId = si[0]; var setSocialId = si[1];
  var ld = useState(false); var loading = ld[0]; var setLoading = ld[1];
  var rs = useState(null); var results = rs[0]; var setResults = rs[1];
  var er = useState(""); var err = er[0]; var setErr = er[1];
  var ex = useState(null); var expanded = ex[0]; var setExpanded = ex[1];

  function lookup() {
    var id = socialId.trim().toUpperCase();
    if (!id.match(/^101-\d{10}$/)) {
      setErr("Enter a valid Social ID in the format 101-0000000001");
      return;
    }
    setLoading(true); setErr(""); setResults(null);
    Promise.all([
      sbRpc("get_citizen_votes_by_social_id", { p_social_id: id }),
      sbRpc("get_citizen_mandates_by_social_id", { p_social_id: id }),
      sbRpc("get_citizen_advocates_by_social_id", { p_social_id: id }),
      sbGet("public_citizens", "social_id=eq." + encodeURIComponent(id), "social_id,region,dob")
    ]).then(function(responses) {
      setLoading(false);
      var votes = responses[0] || [];
      var mandates = responses[1] || [];
      var advocates = responses[2] || [];
      var profile = (responses[3] || [])[0] || null;
      if (!votes.length && !mandates.length && !profile) {
        setErr("No citizen found with that Social ID, or their Declaration is not yet complete.");
        return;
      }
      // Build structured result
      var voteMap = {};
      for (var i = 0; i < votes.length; i++) {
        var v = votes[i];
        if (!voteMap[v.dept_id]) voteMap[v.dept_id] = {};
        voteMap[v.dept_id][v.question_idx] = v.answer;
      }
      var mandateMap = {};
      for (var i = 0; i < mandates.length; i++) { mandateMap[mandates[i].dept_id] = mandates[i].choice; }
      var advocateMap = {};
      for (var i = 0; i < advocates.length; i++) { advocateMap[advocates[i].dept_id] = advocates[i].choice; }
      setResults({ socialId: id, votes: voteMap, mandates: mandateMap, advocates: advocateMap, region: profile ? profile.region : null, dob: profile ? profile.dob : null });
    }).catch(function() {
      setLoading(false);
      setErr("Could not reach the registry. Check your connection and try again.");
    });
  }

  return (
    <div className="fade">
      <button onClick={props.onBack}
        style={{ appearance:"none", border:"none", background:"transparent", cursor:"pointer", fontFamily:SANS, fontSize:13, color:GRAPHITE, padding:"0 0 18px" }}>
        Back
      </button>
      <h2 style={{ fontFamily:SERIF, fontSize:"clamp(22px,4vw,30px)", fontWeight:700, margin:"0 0 6px", color:INK }}>Public Vote Record</h2>
      <Eyebrow>Look up any citizen by Social ID</Eyebrow>
      <HR mt={16} mb={20}/>
      <p style={{ fontFamily:SERIF, fontSize:15, lineHeight:1.7, color:INK, margin:"0 0 24px" }}>
        Every citizen's Declaration votes are public record, attributed to their Social ID only. No personal information -- no name, no email, no date of birth -- is accessible here.
      </p>
      <div style={{ display:"flex", gap:10, marginBottom:8, flexWrap:"wrap" }}>
        <input style={Object.assign({}, inp, { flex:1, minWidth:200, fontFamily:"monospace", fontSize:16, letterSpacing:"0.05em" })}
          type="text" value={socialId} placeholder="101-0000000001"
          onChange={function(e){ setSocialId(e.target.value); setErr(""); }}
          onKeyDown={function(e){ if(e.key==="Enter") lookup(); }}/>
        <Btn onClick={lookup} disabled={loading} label={loading ? "Searching..." : "Look up"}/>
      </div>
      {err && <div style={{ color:SIGNAL, fontFamily:SANS, fontSize:12, marginBottom:16 }}>{err}</div>}

      {results && (
        <div>
          <div style={{ background:INK, padding:"14px 16px", marginBottom:16 }}>
            <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase", color:"rgba(255,255,255,0.45)", marginBottom:4 }}>Social ID</div>
            <div style={{ fontFamily:"monospace", fontSize:18, fontWeight:700, color:PAPER, marginBottom:12 }}>{results.socialId}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
              <div>
                <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(255,255,255,0.4)", marginBottom:2 }}>Region</div>
                <div style={{ fontFamily:SERIF, fontSize:13, color:results.region?PAPER:"rgba(255,255,255,0.3)", fontStyle:results.region?"normal":"italic" }}>{results.region || "Not recorded"}</div>
              </div>
              <div>
                <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(255,255,255,0.4)", marginBottom:2 }}>Age</div>
                <div style={{ fontFamily:SERIF, fontSize:13, color:results.dob?PAPER:"rgba(255,255,255,0.3)", fontStyle:results.dob?"normal":"italic" }}>
                  {results.dob ? Math.floor((Date.now()-new Date(results.dob).getTime())/(1000*60*60*24*365.25))+" years old" : "Not recorded"}
                </div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:10, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.12)" }}>
              <div>
                <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(255,255,255,0.4)", marginBottom:2 }}>Accumulated Credits</div>
                <div style={{ fontFamily:SERIF, fontSize:13, fontWeight:700, color:results.dob?PAPER:"rgba(255,255,255,0.3)" }}>
                  {results.dob ? calcCredits(results.dob).creditsEarned.toLocaleString()+" SC" : "--"}
                </div>
              </div>
              <div>
                <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(255,255,255,0.4)", marginBottom:2 }}>Annual Allotment</div>
                <div style={{ fontFamily:SERIF, fontSize:13, fontWeight:700, color:results.dob?PAPER:"rgba(255,255,255,0.3)" }}>
                  {results.dob ? calcCredits(results.dob).annualAllotment.toLocaleString()+" SC/yr" : "--"}
                </div>
              </div>
            </div>
            <div style={{ fontFamily:SANS, fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:10 }}>
              Declaration votes: {Object.keys(results.votes).reduce(function(t,d){return t+Object.keys(results.votes[d]).length;},0)} answers recorded
            </div>
          </div>

          <div style={{ marginBottom:8, fontFamily:SANS, fontSize:11, color:GRAPHITE }}>
            Tap a department to view all answers.
          </div>

          {DEPARTMENTS.map(function(dept) {
            var deptVotes = results.votes[dept.id] || {};
            var mandate = results.mandates[dept.id];
            var advocate = results.advocates[dept.id];
            var answered = Object.keys(deptVotes).length;
            var yesCount = Object.values(deptVotes).filter(function(a){return a==="yes";}).length;
            var isOpen = expanded === dept.id;

            return (
              <div key={dept.id} style={{ border:"1px solid "+HAIRLINE, marginBottom:8 }}>
                <button onClick={function(){setExpanded(isOpen ? null : dept.id);}}
                  style={{ appearance:"none", border:"none", background:PAPER, cursor:"pointer", width:"100%", padding:"14px 16px", textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:GRAPHITE, marginBottom:3 }}>{dept.short || dept.name}</div>
                    <div style={{ fontFamily:SERIF, fontSize:15, fontWeight:700, color:INK }}>{dept.name}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                    {answered > 0 ? (
                      <div>
                        <div style={{ fontFamily:SANS, fontSize:10, color:GRAPHITE, marginBottom:2 }}>{yesCount} Yes / {answered-yesCount} No</div>
                        {mandate && <div style={{ fontFamily:SANS, fontSize:10, fontWeight:700, color:SIGNAL }}>Mandate: {mandate}</div>}
                      </div>
                    ) : (
                      <div style={{ fontFamily:SANS, fontSize:11, color:GRAPHITE, fontStyle:"italic" }}>No answers</div>
                    )}
                    <div style={{ fontFamily:SANS, fontSize:11, color:GRAPHITE, marginTop:4 }}>{isOpen ? "v" : ">"}</div>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop:"1px solid "+HAIRLINE, padding:"14px 16px", background:FILL }}>
                    {dept.questions.map(function(q, qi) {
                      var answer = deptVotes[qi];
                      return (
                        <div key={qi} style={{ marginBottom:14 }}>
                          <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                            <div style={{ fontFamily:SANS, fontSize:10, fontWeight:700, color:SIGNAL, flexShrink:0, marginTop:2, minWidth:20 }}>{qi+1}.</div>
                            <div style={{ flex:1 }}>
                              <p style={{ fontFamily:SERIF, fontSize:13, lineHeight:1.5, color:INK, margin:"0 0 6px" }}>{q}</p>
                              {answer ? (
                                <div style={{ display:"inline-block", background:answer==="yes"?GREEN+"18":RED_DIM+"18", border:"1px solid "+(answer==="yes"?GREEN:RED_DIM), padding:"3px 10px" }}>
                                  <span style={{ fontFamily:SANS, fontSize:11, fontWeight:700, color:answer==="yes"?GREEN:RED_DIM, letterSpacing:"0.1em", textTransform:"uppercase" }}>{answer==="yes"?"Yes":"No"}</span>
                                </div>
                              ) : (
                                <div style={{ fontFamily:SANS, fontSize:11, color:GRAPHITE, fontStyle:"italic" }}>Not answered</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {mandate && (
                      <div style={{ borderTop:"1px solid "+HAIRLINE, paddingTop:12, marginTop:8 }}>
                        <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:GRAPHITE, marginBottom:4 }}>Mandate priority</div>
                        <div style={{ fontFamily:SERIF, fontSize:14, fontWeight:700, color:SIGNAL }}>{mandate}</div>
                      </div>
                    )}
                    {advocate && (
                      <div style={{ borderTop:"1px solid "+HAIRLINE, paddingTop:12, marginTop:8 }}>
                        <div style={{ fontFamily:SANS, fontSize:9, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:GRAPHITE, marginBottom:4 }}>Advocate vote</div>
                        <div style={{ fontFamily:SERIF, fontSize:14, fontWeight:700, color:INK }}>{advocate}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <HR mt={24} mb={16}/>
      <div style={{ fontFamily:SANS, fontSize:11, color:GRAPHITE, lineHeight:1.7 }}>
        The Humanity Code stores no personal information in this lookup. Your name, email address, and date of birth are visible only to you on your own dashboard. All votes in the public record are attributed to Social IDs only.
      </div>
    </div>
  );
}

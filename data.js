// Shared attendee list used by voter selection and candidate ranking.
const ATTENDEES = [
  "Andy Hong","Bernales Vincent John Dabi","Brenda Tan","Caleb Chan","Chang Chee Choon",
  "Chen Qisen","Chirag Hablani","Daniel Nilzen","Danna Rasyad Priyatna","Denise Lim",
  "Evelynn Zhang","Gina Zhao","Ho Li Lian","Huang Yuhan","Jackson Hung","Jason Chen",
  "Jeff Neo Yu Xuan","Jocelyn Yip","Joey Low","Kyaw Win Htun","Lee Eer Rou","Liong Liana Hani",
  "Marnfah Kanjanavanit","Marylene Mendoza De Lara","Melissa Mak","Neo Wei Lin",
  "Ofelia Caparas Pascual","Philip Jacobs","Samuel Tan","Satoshi Okawara","Sean The",
  "Shiju Balakrishnan","Sirada Laosirichon (Muffin)","Steffen Kleinert","Teoh Sun Sun",
  "Vivian Johnny","Xie Chen Chen","Zhao Yue","Chen Yong Han","Opeda Alyssa Jane Postrado",
  "Htet Win Tun","Repunte Christian Rochard Javines","Mohamed Bessam Shajahan","Thomas Wang"
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const TOTAL_ATTENDEES = ATTENDEES.length;

// Shared HTML escaper (used by app.js and results.js for anything put in innerHTML).
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

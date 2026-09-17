const fs = require('fs');
let file = fs.readFileSync('src/pages/LoginPage.tsx', 'utf8');

// 1. Container padding
file = file.replace(
  `py-8 sm:py-12`,
  `py-4 sm:py-6`
);

// 2. Logo sizing
file = file.replace(
  `mx-auto w-16 h-16 sm:w-18 sm:h-18 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/10 flex-shrink-0`,
  `mx-auto w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/10 flex-shrink-0`
);
file = file.replace(
  `<img src={settings.logo_url} alt="Logo" className="w-12 h-12 object-contain rounded-xl" />`,
  `<img src={settings.logo_url} alt="Logo" className="w-8 h-8 object-contain rounded-xl" />`
);
file = file.replace(
  `<School className="w-10 h-10 sm:w-11 sm:h-11" />`,
  `<School className="w-8 h-8" />`
);

// 3. Title typography
file = file.replace(
  `<h1 className="mt-4 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">`,
  `<h1 className="mt-2 text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">`
);
file = file.replace(
  `<p className="mt-1 text-base font-bold text-blue-700">`,
  `<p className="text-sm font-bold text-blue-700 mt-0.5">`
);

// 4. School year block
file = file.replace(
  `<div className="bg-white/90 backdrop-blur-xs border border-blue-200/80 rounded-2xl px-4 py-2.5 shadow-xs flex items-center justify-between gap-2">`,
  `<div className="bg-white/90 backdrop-blur-xs border border-blue-200/80 rounded-xl px-3 py-1.5 shadow-xs flex items-center justify-between gap-2">`
);
file = file.replace(
  `<div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">`,
  `<div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">`
);

// 5. Tabs
file = file.replace(
  `className={\`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all \${`,
  `className={\`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all \${`
);
file = file.replace(
  `className={\`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all \${`, // For the second tab
  `className={\`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all \${`
);
// Make sure both tabs got updated correctly (the regex replaces the first match, so I'll just write a safer replace).

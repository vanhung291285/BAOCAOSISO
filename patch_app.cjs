const fs = require('fs');
let file = fs.readFileSync('src/App.tsx', 'utf8');

file = file.replace(
`  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100/80 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-600">Đang tải dữ liệu hệ thống...</p>
        </div>
      </div>
    );
  }`,
`  if (loading) {
    // Keep a completely transparent state if strictly necessary, but avoid visual flash
    return null;
  }`
);

fs.writeFileSync('src/App.tsx', file);
console.log("Patched App!");

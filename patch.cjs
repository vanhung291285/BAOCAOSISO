const fs = require('fs');
let file = fs.readFileSync('src/pages/AttendanceInputPage.tsx', 'utf8');

file = file.replace(
`    setAbsentStudents((prev) => [...prev, { full_name: '', address: '', reason: 'Ốm' }]);

    // Tự động đồng bộ tăng số vắng ở chỉ tiêu chính nếu cần
    if (enabledIndicators[0]) {
      const mainId = enabledIndicators[0].id;
      setFormValues((prevVals) => {
        const cur = prevVals[mainId] || { total: 0, present: 0, absent: 0 };
        const total = typeof cur.total === 'number' ? cur.total : 0;
        const curAbsent = typeof cur.absent === 'number' ? cur.absent : 0;
        const newAbsent = Math.max(curAbsent, absentStudents.length + 1);
        const newPresent = Math.max(0, total - newAbsent);

        return {
          ...prevVals,
          [mainId]: {
            ...cur,
            total,
            absent: newAbsent,
            present: newPresent,
          },
        };
      });
    }`,
`    setAbsentStudents((prev) => {
      const newLength = prev.length + 1;
      
      // Tự động đồng bộ tăng số vắng ở chỉ tiêu chính nếu cần
      if (enabledIndicators[0]) {
        const mainId = enabledIndicators[0].id;
        setFormValues((prevVals) => {
          const cur = prevVals[mainId] || { total: 0, present: 0, absent: 0 };
          const total = typeof cur.total === 'number' ? cur.total : 0;
          const curAbsent = typeof cur.absent === 'number' ? cur.absent : 0;
          const newAbsent = Math.max(curAbsent, newLength);
          const newPresent = Math.max(0, total - newAbsent);

          return {
            ...prevVals,
            [mainId]: {
              ...cur,
              total,
              absent: newAbsent,
              present: newPresent,
            },
          };
        });
      }
      return [...prev, { full_name: '', address: '', reason: 'Ốm' }];
    });`
);

fs.writeFileSync('src/pages/AttendanceInputPage.tsx', file);
console.log("Patched!");

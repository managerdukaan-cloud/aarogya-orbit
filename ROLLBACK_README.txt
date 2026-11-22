ROLLBACK TO PHASE 26 (undo of Phase 27-30)
==========================================
1) Copy everything in this ZIP into your aarogya-orbit folder, choose "Replace".
   (This puts back the Phase 26 version of 49 files, including firebase.json and functions/index.js.)
2) DELETE these folders from your aarogya-orbit folder (they were added in Phase 27-30):
     .github     (this is what makes GitHub run the tests and show the red cross)
     tests
     docs
   Note: .github is a hidden folder. In File Explorer turn on View > Show > Hidden items.
3) Deploy again so the live site matches:
     firebase deploy --only functions,hosting,firestore:rules,storage
4) In GitHub Desktop: commit and push. With the .github folder gone there is no red cross.

What you give up by rolling back:
 - the slot-already-taken message will be hidden again on the booking pages
 - removing a doctor from a hospital will fail again (the transaction bug)
 - 320px phones: header/grids may overflow; tap targets are smaller; some fields have no accessible name
 - no automatic tests, no data-model/operations docs, no security headers

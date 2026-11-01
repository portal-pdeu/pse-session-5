// The modules never change during an event, so their text is part of the portal
// itself. Only whether each one is released is read from Appwrite.
//
// Keep in step with MODULES in appwrite/schema.mjs (a test checks this). Points
// here are for display; the Function scores from the points in the database.

export interface StaticModule {
  number: number
  title: string
  points: number
  description: string
}

export const MODULES: StaticModule[] = [
  { number: 0, title: "Project Scaffold", points: 50, description: "The starting point, and your first flag. Run the app and open the root route - the build key it prints is your first capture. Learn the loop here: download, run, find the flag, submit it." },
  { number: 1, title: "Diagnostics", points: 100, description: "The agents shipped a diagnostics service with the very first build, and nobody took it out of the public build. Run it and read what it prints - one of those fields should never be public." },
  { number: 2, title: "Support Tickets", points: 200, description: "Users open tickets and staff reply. The list endpoint filters by owner - the detail endpoint was written earlier and never got the same treatment." },
  { number: 3, title: "Billing & Checkout", points: 350, description: "The money path. The checkout takes the amount from the request, and support has an internal re-pricing path for broken orders." },
  { number: 4, title: "Profile & File Uploads", points: 500, description: "Avatars, bio, and user-uploaded files. Approve the upload flow if you dare. The storage backend keeps a signed key outside the public folder." },
  { number: 5, title: "Sessions & Tokens", points: 700, description: "Session handling and token issuance. Tokens carry a payload and a signature - but the internal staff panel only opens for staff sessions." },
]

# SSC Buddy Focus Lock

Load the extracted folder in Chrome or Edge using Extensions > Developer mode > Load unpacked, then sign in with your SSC Buddy account. Reload an existing installation after updating these files.

Add website domains, such as parmar.com, using the extension or task widget. Add current website uses your active tab. Set focus time with the clock picker and start from either place.

The website limit is configured once in `MAX_STUDY_WEBSITES` in `shared/study-selection.ts`. Rebuild the web app, extension and Windows widgets after changing it.

During a session, selected websites cannot be removed or replaced. Unused slots can be filled. Other websites unlock at the scheduled deadline. There is no early-stop control. Existing cached sessions continue through temporary connection failures.

The blocked page shows a motivational image and offers Add for eligible non-social websites while a slot remains. YouTube is handled as an ordinary website; there is currently no channel verification or special Shorts blocking.

A connected browser extension enforces browser restrictions; the task widget manages the same account session.

Start begins the timer immediately, including when no browser is connected. A browser that connects later applies Focus Lock for the remaining time, preserving the original deadline.

Session changes use one Firestore document listener instead of ten-second REST polling. The minute watchdog checks local deadlines and restarts a failed listener; it does not fetch the control document on every tick. Listener initialization/reconnection and actual remote changes can still incur reads. Device acknowledgement writes happen on session/break state changes, or every five minutes while active. Idle registrations do not send periodic heartbeat writes. The successful heartbeat is cached in extension storage across service-worker restarts. Configure the interval in `shared/study-presence.ts`.

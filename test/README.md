## Offline Data Service Tests

Unit tests are not required for montage-sentinel code. Write unit tests only when it is likely to save development time.

Tests can be run by executing `npm install` in the `test` subdirectory and then
loading `test/run.html` through a web server. All tests should pass. Any test
that does not pass should be disabled, and a corresponding bug report should be
filed and assigned to the person most likely to be able to fix the test or the
code that broke it.

Tests can be added by creating
[Jasmine 2.3.4](http://jasmine.github.io/2.3/introduction.html) test scripts in
`test/spec` and editing `test/run.reel/run.js` to require those scripts. See the existing tests there for examples.

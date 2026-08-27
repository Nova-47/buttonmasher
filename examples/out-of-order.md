# Out of order

**Target:** Four-step signup wizard (account → verify email → choose plan →
activate) in a Rails-style controller.

## The code

```ruby
# step 2 sets session[:verified] = true after the code matches

def choose_plan     # step 3
  current_user.update!(plan: params[:plan])
  redirect_to activate_path
end

def activate        # step 4
  current_user.update!(status: "active")
  WelcomeMailer.deliver(current_user)
  redirect_to dashboard_path
end
```

## What buttonmasher did

```
BUTTONMASHER

BROKE — activation without verification

I went straight to step 4.

activate assumes steps 2 and 3 happened because the UI only links to
it from step 3. It checks nothing: not verified_at, not plan. A
bookmarked or shared /activate URL, or a Back-then-Forward through
an old tab, activates an unverified account with plan = nil.

Impact:
Unverified emails get active accounts and a welcome mail. Anything
downstream that trusts status = "active" now trusts nothing.

Smallest fix:
activate checks the two facts it depends on and redirects to the
missing step. Applied.

Retest:
GET /activate with no verification → redirected to /verify, status
unchanged. Full sequence still activates.

Refreshing step 3 and submitting step 2 twice were boring; the
verification code check is idempotent.
```

## The fix

```diff
 def activate
+  return redirect_to verify_path unless current_user.verified_at
+  return redirect_to choose_plan_path unless current_user.plan
   current_user.update!(status: "active")
```

Each step guards the facts it depends on, not the page the user came from.
The previous page is a suggestion; the database is the truth.

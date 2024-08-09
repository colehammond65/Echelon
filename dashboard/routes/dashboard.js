const express = require('express');
const router = express.Router();

router.get('/', checkAuthenticated, (req, res) => {
    res.render('dashboard.ejs', { name: req.user.email });
});

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
}

module.exports = router;

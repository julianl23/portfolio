//"use strict";
(function($, Backbone, Keek){

//Defining Keek here as it's required in the definition of the views. We'll reinitialize it when we load the messenger.
var Keek = new Keek();

window.App = { Views: {}, Messenger: null };

var UserModel = Backbone.Model.extend({
    defaults: function() {
        return {
            user_id : null,
            username: null,
            name: null,
            has_avatar: null, //(0 => no avatar,1 => has avatar)
            avatar: null,
            avatar_border: null,
            bio: null,
            gender: null, //m or f
            birthdate: null,
            url: null,
            membersince: null,
            location: {
                country: null,
                country_code: null,
                country_flag: null
            },
            timezone : null,
            websites : [],
            stats: {
                keeks: null,
                followers: null,
                following: null,
                comments: null,
                subscribers: null,
                subscribed: null,
                views: null
            },
            is_featured : null, /*or 0*/
            status: {
                typing_status:{
                    web: null,
                    mobile: null
                },
                online_status:{
                    web: null,
                    mobile: null
                }
            }
        };
    }
});

var ConversationModel = Backbone.Model.extend({
    defaults: function() {
        return {
            conversation_id: null,
            users: [],
            messages_pending: null,
            last_updated: null,
            requires_user_acceptance_for: null,
            users_pending_acceptance: null,
            has_been_accepted: null,
            authenticated_user_is_initiator: null,
            created: null,
            message: {
                message_id: null,
                conversation_id: null,
                producer: {
                    user_id: null,
                    username: null,
                    name: null,
                    avatar: null,
                    status: {
                        typing_status: {
                            web: null,
                            mobile: null
                        },
                        online_status:{
                            web: null,
                            mobile: null
                        }
                    }
                },
                read_status: null,
                mark_read_callback_id: null,
                details: {
                    caption: '',
                    entities: {
                        hashtags: [],
                        mentions: [],
                        urls: []
                    },
                    video: null,
                    thumbnail: null,
                    duration: null
                },
                whispered : null,
                created: null
            }
        };
    }
});

var MessageModel = Backbone.Model.extend({
    defaults: function() {
        return {
            type: null,
            state: null,
            message_id: null,
            conversation_id: null,
            producer: {
                user_id: null,
                username: null,
                name: null,
                avatar: null,
                status: {
                    typing_status: {
                        web: null,
                        mobile: null
                    },
                    online_status:{
                        web: null,
                        mobile: null
                    }
                }
            },
            read_status: null,
            mark_read_callback_id: null,
            details: {
                caption: null,
                video: null,
                thumbnail: null,
                duration: null
            },
            whispered : null,
            created: null,
            timestamp: null,
            history: null
        };
    }
});

var MessengerModel = Backbone.Model.extend({
    //These defaults match the data that comes from update_notifications, called in global.js
    //num - Total number of pending notifications, including standard keekmail
    defaults: function() {
        return {
            notif: 0,
            subs: 0,
            priv: 0,
            num: 0
        };
    }
});

//Backbone view corresponding to the main messenger. This contains various utility functions and values
//Views are all instantiated in the initialize function as delegate views.
App.Views.Messenger = Backbone.View.extend({
    el: $('#keek-messenger-window'),
    tagName: 'div',
    title: '',
    views: {},
    modal: null,
    currentUserId: null,
    currentUserModel: new UserModel(),
    conversation: new ConversationModel(),
    audioEnabled: true,
    currentView: null,
    previousView: null,
    model: new MessengerModel(),
    updateInterval: 3000,
    conversationsPollInterval: 4000,
    resizableOpts: {
        maxWidth: 86,
        minWidth: 86,
        maxHeight: $(window).height() - 50,
        minHeight: 467,
        handles: 's',
        resize: function() {
            App.Messenger.resize();
        }
    },
    max_conversation_users: 36,
    minimizedBeforeResizeThreshold: false,
    history: [],
    currentHistoryIndex: 0,
    originView: null,
    viewName: 'messenger',
    protectFromClose: false,
    isActiveWindow: true,
    draggableEnabled: true,
    googleAnalyticsEvents: {
        new_message: 'new_message',
        add_friend: 'chat_window/add_friend',
        user_list: 'chat_window/user_list'
    },
    initialize: function() {
        var self = this;
        var savedConvoId;

        _.bindAll(this, "updateBadges", 'handleStorage');

        this.currentUserId = this.options.currentUserId;

        this.views.conversationListView = new App.Views.ConversationList({
            el: $('#messenger-user-list'),
            parent: this
        });
        this.views.newMessageView = new App.Views.NewMessage({
            el: $('#messenger-new-message'),
            parent: this
        });
        this.views.conversationView = new App.Views.Conversation({
            el: $('#messenger-conversation'),
            parent: this
        });
        this.views.addFriendOverlayView = new App.Views.AddFriendOverlay({
            el: $('#messenger-add-friend-overlay'),
            parent: this
        });
        this.views.requestStateErrorOverlayView = new App.Views.RequestStateErrorOverlay({
            el: $('#messenger-request-state-error-overlay'),
            parent: this
        });
        this.views.leaveConversationOverlayView = new App.Views.LeaveConversationOverlay({
            el: $('#messenger-leave-convo-overlay'),
            parent: this
        });
        this.views.requestStateControlsOverlayView = new App.Views.RequestStateControlsOverlay({
            el: $('#messenger-request-state-controls-overlay'),
            parent: this
        });
        this.views.requestStateUnblockOverlayView = new App.Views.RequestStateUnblockOverlay({
            el: $('#messenger-request-state-unblock-overlay'),
            parent: this
        });
        this.views.profileView = new App.Views.Profile({
            el: $('#messenger-profile'),
            parent: this,
            userId: ''
        });
        this.views.addFriendView = new App.Views.AddFriend({
            el: $('#messenger-add-friend'),
            parent: this
        });
        this.views.conversationParticipantsView = new App.Views.ConversationParticipants({
            el: $('#messenger-conversation-users-list'),
            parent: this
        });

        this.views.navigationView = new App.Views.Navigation ({
            el: $('.messenger-header-btn-group.left-group'),
            parent: this
        });

        this.modal = new App.Views.Modal({
            el: $('#messenger-modal-overlay'),
            parent: this
        });

        if (window.location.href.indexOf('mail/private') > -1){
            this.views.messengerLandingView = new App.Views.MessengerLanding ({
                el: $('#messenger-landing'),
                parent: this
            });
        }

        this.model.bind('change', this.updateBadges);

        this.originView = this.views.conversationListView;

        $('.message-btn').on('click', function() {
            var targetUsername = $(this).data('username');
            var targetId = $(this).data('id');

            //Call can_send_message_to to check the eligibility 

            Keek.api('/message/can_send_message_to', { user_id: targetId }, function(data) {
                if (data.status.code !== 2000) {
                    alertDialog({
                        title: '',
                        text: data.status.message,
                        buttons: [
                            {
                                text: 'Ok',
                                closeDialog: true
                            }
                        ]
                    });
                } else {
                    if (localStorage.getItem('messenger.minimized') === 'true'){
                        self.toggleMessenger();
                    }

                    if(localStorage.getItem('messenger.closed') === 'true'){
                        self.openMessenger();
                    }

                    //Pull down user object from server to pass to new message view
                    Keek.api('/user/profile', { user_id: targetId }, function(data) {
                        if (data.status.code !== 2000) {
                            console.error("Error: %s (%i)", data.status.message, data.status.code);
                        } else {
                            var user = new UserModel(data.user);
                            var newMessageView = self.views.newMessageView;
                            var currentView = self.getCurrentViewObject();

                            //Send user model to New Message View
                            newMessageView.selectedUserFromExternal = user;

                            if (currentView === newMessageView) {
                                //Trigger the user to be added in the list here
                                newMessageView.addUserFromExternal();
                            } else {
                                self.landingPageNavigateForward({
                                    target: newMessageView,
                                    referrer: currentView
                                });
                            }
                        }
                    });
                }
            });
        });

        if (this.localStorageCheck()) {
            if (localStorage.getItem('messenger.closed') !== 'true') {
                this.initializeMessenger();
            } else {
                this.closeMessenger(null);
                localStorage.setItem('messenger.uninitialized', '1');
            }
        }

        $(window).on('focus', function() {
            self.isActiveWindow = true;
        });

        $(window).on('blur', function() {
            self.isActiveWindow = false;
        });

        //https://gist.github.com/padolsey/527683
        this.ie = (function(){
            var undef,
                v = 3,
                div = document.createElement('div'),
                all = div.getElementsByTagName('i');
            
            while (
                div.innerHTML = '<!--[if gt IE ' + (++v) + ']><i></i><![endif]-->',
                all[0]
            );
            
            return v > 4 ? v : undef;
        }());
    },
    handleStorage: function(e) {
        if (e.key === 'messenger.close_messenger' && e.newValue === '1' && !this.isActiveWindow) {
            //The localStorage flag to close all messenger windows has been set. Close this messenger if it is not the active window.
            this.closeMessenger(null, true);
        }
    },
    initializeMessenger: function() {
        var self = this;

        //If there is an existing history cache in local storage, grab it and set it to this.history
        if (this.localStorageCheck() && localStorage.getItem('messenger.history')) {
            this.history = JSON.parse(localStorage.getItem('messenger.history'));
            this.currentHistoryIndex = parseInt(localStorage.getItem('messenger.history.index'), 10);
        } else {
            //Find the current view
            var currentView = this.getCurrentViewObject();
            if (!currentView) {
                //We weren't able to find the current view. Assume the origin view.
                //Place the current view as element 0 in the history hash
                this.history.push({
                    view: this.originView.viewName,
                    buttonToDisplay: this.originView.headerNavigationType,
                    referrer: null
                });
            } else {
                //Place the current view as element 0 in the history hash
                this.history.push({
                    view: currentView.viewName,
                    buttonToDisplay: currentView.headerNavigationType,
                    referrer: null
                });
            }
        }

        this.initializeMessageWindow();

        if (this.localStorageCheck()) {
            savedConvoId = localStorage.getItem('messenger.currentConversationId');
            var audioEnabled = localStorage.getItem('messenger.audioEnabled');
            
            Keek.api('/message/conversation', { conversation_id: savedConvoId }, function(data) {
                if (data.status.code === 2000) {
                    self.conversation.set(data.conversation);
                }
            });

            //localStorage stores data as strings, not boolean, so we have to do a quick parse
            if (audioEnabled === 'true') {
                this.audioEnabled = true;
                $('#enable-audio').hide();
                $('#disable-audio').show();
            } else if (audioEnabled === 'false') {
                this.audioEnabled = false;
                $('#disable-audio').hide();
                $('#enable-audio').show();
            } else {
                //Local Storage key is not set for audioEnabled or format came back odd. Set to true.
                localStorage.setItem('messenger.audioEnabled', 'true');
                $('#enable-audio').hide();
                $('#disable-audio').show();
            }
        } else {
            this.audioEnabled = true;
        }

        var storedSubscriptionPending = $('#initialSubscriptionCount').text();
        var storedNumPrivPending = $('#initialPrivMsgCount').text();
        var storedActivityPending = $('#initialActivityCount').text();
        var storedNotifsPending = $('#initialNotifCount').text();

        storedSubscriptionPending = storedSubscriptionPending.length > 0 ? parseInt(storedSubscriptionPending, 10) : 0;
        storedNumPrivPending = storedNumPrivPending.length > 0 ? parseInt(storedNumPrivPending, 10) : 0;
        storedActivityPending = storedActivityPending.length > 0 ? parseInt(storedActivityPending, 10) : 0;
        storedNotifsPending = storedNotifsPending.length > 0 ? parseInt(storedNotifsPending, 10) : 0;

        this.model.set({ subs: storedSubscriptionPending, priv: storedNumPrivPending, notif: storedActivityPending, num: storedNotifsPending });

        $('#messenger-close').on('click', function(e) {
            self.closeMessenger(e);
        });

        $('#messenger-minimize').on('click', function(e) {
            e.preventDefault();
            self.toggleMessenger(true);
        });

        $(window).on('resize', function(e) {
            //jQuery UI Draggable fires a resize event, so we need to make sure we're using our resize function only when the target is the window
            if (e.target === window)
                self.resize();
        });

        if (window.addEventListener) {
          window.addEventListener("storage", this.handleStorage, false);
        } else {
          window.attachEvent("onstorage", handle_storage);
        }

        //Remove the close_messenger item as it's no longer needed
        localStorage.removeItem('messenger.close_messenger');
        localStorage.removeItem('messenger.uninitialized');
    },
    initializeMessageWindow: function() {
        var window_height = $(window).height();
        var window_size = {
            width: $(window).width(),
            height: $(window).height()
        };
        var self = this;

        $('#keek-messenger-window').show();


        var dragOpts = {
            handle: $('.messenger-window-header')
        };

        var $containmentDiv = $('#container-logged');

        //navigator.sayswho() -> [browsername, version]
        navigator.sayswho= (function(){
            var N= navigator.appName, ua= navigator.userAgent, tem;
            var M= ua.match(/(opera|chrome|safari|firefox|msie)\/?\s*(\.?\d+(\.\d+)*)/i);
            if(M && (tem= ua.match(/version\/([\.\d]+)/i))!== null) M[2]= tem[1];
            M= M? [M[1], M[2]]: [N, navigator.appVersion, '-?'];

            return M;
        })();

        $('#keek-messenger-window').drag("start",function( ev, dd ){
            if (self.draggableEnabled) {
                dd.limit = {
                    top: $containmentDiv[0].offsetTop,
                    left: $containmentDiv[0].offsetLeft
                };

                dd.limit.bottom = dd.limit.top + $(window).height()-$('#keek-messenger-window').outerHeight();
                dd.limit.right = dd.limit.left + $(window).width()-$('#keek-messenger-window').outerWidth();
            }
        }, dragOpts)
        .drag(function( ev, dd ){
            if (self.draggableEnabled && dd.limit) {
                var offset = {
                    y: navigator.sayswho[0] == "Safari" && navigator.sayswho[1] < '6.0.3' ? dd.offsetY : dd.offsetY - $(document).scrollTop(),
                    x: navigator.sayswho[0] == "Safari" && navigator.sayswho[1] < '6.0.3' ? dd.offsetX : dd.offsetX - $(document).scrollLeft()
                };

                $(this).css({
                    top: Math.min( dd.limit.bottom, Math.max( dd.limit.top, offset.y ) ),
                    left: Math.min( dd.limit.right, Math.max( dd.limit.left, offset.x ) )
                });
            }
        })
        .drag('end', function(ev, ed) {
            if (self.draggableEnabled) {
                var messenger_pos = $('#keek-messenger-window').position();

                if (self.localStorageCheck()) {
                    if (messenger_pos.left < 0) { messenger_pos.left = 0; }
                    if (messenger_pos.top < 0) { messenger_pos.top = 0; }

                    localStorage.setItem('messenger.position', JSON.stringify(messenger_pos));
                }
            }
        });

        soundManager.setup({
            url: '/js',
            flashVersion: 9,
            useFlashBlock: false,
            onready: function() {
                soundManager.createSound({
                    id: 'received',
                    url: '/audio/message.mp3',
                    autoLoad: true,
                    autoPlay: false,
                    onload: function() {

                    }
                });
            }
        });

        //Check local storage for a messenger window position.  If no position or if local storage is not supported, display the messenger window in the default position
        if (this.localStorageCheck()) {
            var messengerPos = localStorage.getItem('messenger.position');

            if (typeof messengerPos !== 'undefined' && messengerPos !== '' && messengerPos !== null) {
                var savedPosition = JSON.parse(localStorage.getItem('messenger.position'));

                // If messenger is not visible, put it in the default position
                if (savedPosition.left > window_size.width || savedPosition.left < 0 || savedPosition.top + $('#keek-messenger-window').height() > window_size.height) {
                    $('#keek-messenger-window').css({
                        top: window_size.height - $('#keek-messenger-window').height() - 4,
                        left: window_size.width - $('#keek-messenger-window').width() - 4 //4 accounts for border on messaging window
                    });
                } else {
                    $('#keek-messenger-window').css({
                        top: savedPosition.top,
                        left: savedPosition.left
                    });
                }
            } else {
                $('#keek-messenger-window').css({
                    top: window_size.height - $('#keek-messenger-window').height() - 4,
                    left: window_size.width - $('#keek-messenger-window').width() - 4 //4 accounts for border on messaging window
                });
            }

            if (localStorage.getItem('messenger.minimized') === 'true') {
                this.minimizedBeforeResizeThreshold = true;
                this.draggableEnabled = false;
                $('#keek-messenger-window').addClass('minimized');
                $('#messenger-minimize').addClass('maximize');

                $('#keek-messenger-window').css({
                    top: 'auto',
                    bottom: 0,
                    //left: messenger_bar.position().left - $('#keek-messenger-window').width() - 4 - 20 //4 accounts for border on messaging window
                    left: window_size.width - $('#keek-messenger-window').width() - 4 - 20 //4 accounts for border on messaging window
                });

            }
        } else {
            $('#keek-messenger-window').css({
                top: window_size.height - $('#keek-messenger-window').height() - 4,
                left: window_size.width - $('#keek-messenger-window').width() - 4 //4 accounts for border on messaging window
            });
        }


        //Check local storage to see if a current view should be set.  If not, set the default view
        if (this.localStorageCheck()) {
            if (localStorage.getItem('messenger.current_view') !== null && localStorage.getItem('messenger.current_view') !== '' && localStorage.getItem('messenger.history') !== '') {
                this.loadInitialView(localStorage.getItem('messenger.current_view'), { isDefault: true });
            } else {
                this.loadDefaultView();
            }
        } else {
            this.loadDefaultView();
        }
    },
    closeMessenger: function(e, closedByInactiveWindow){
        if (e) e.preventDefault();
        $('#keek-messenger-window').hide();
        if (this.localStorageCheck() && !closedByInactiveWindow) {
            localStorage.setItem('messenger.closed', 'true'); //localStorage stores strings
        }

        if (this.views.conversationView.updateMessengerPoll) {
            clearInterval(this.views.conversationView.updateMessengerPoll);
            this.views.conversationView.updateMessengerPoll = null;
        }

        if (this.views.conversationListView.polling) {
            clearInterval(this.views.conversationListView.polling);
            this.views.conversationListView.polling = null;
        }

        this.remove();
    },
    openMessenger: function(e) {
        if (e) e.preventDefault();

        if (localStorage.getItem('messenger.uninitialized') === '1') {
            this.initializeMessenger();
        } else {
            $('#keek-messenger-window').show();
        }

        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.closed', 'false');
        }
    },
    toggleMessenger: function(isFromButton){
        var messenger_window_pos = $('#keek-messenger-window').position();
        var toggleBtn = $("#messenger-minimize");
        var self = this;

        if ($('#keek-messenger-window').hasClass('minimized')) {
            $('.messenger-window-header #messenger-title').show();
            $('.messenger-window-header #messenger-minimized-title').hide();
            $(this).removeClass('maximize').addClass('minimize');
            $('.hiddenNavButton').show().removeClass('hiddenNavButton');
            toggleBtn.removeClass('maximize').addClass('minimize');
            this.maximizeMessageWindow(isFromButton);
            
            // Rerender the navigation buttons
            this.views.navigationView.render();
        } else {
            $('.messenger-window-header #messenger-title').hide();
            $('.messenger-window-header #messenger-typing-title').hide();
            $('.messenger-window-header #messenger-minimized-title').show();
            
            // Hide all the navigation buttons
            this.views.navigationView.hide();
            
            $(this).removeClass('minimize').addClass('maximize');
            toggleBtn.removeClass('minimize').addClass('maximize');

            var current_view = App.Messenger.getCurrentViewObject();
            self.changeTitle(current_view.title);
            
            this.minimizeMessageWindow(isFromButton);
        }
    },
    minimizeMessageWindow: function(isFromButton) {
        var leftval;
        var currentTop = $('#keek-messenger-window').css('top');

        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.minimized', 'true');
        }

        this.messenger_window_pos = $('#keek-messenger-window').position();

        var currentPosition = {
            top: currentTop.indexOf('%') > -1 ? currentTop : parseInt(currentTop, 10),
            left: $('#keek-messenger-window').position().left
        };

        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.position', JSON.stringify(currentPosition));
        }

        this.draggableEnabled = false;
        $('#keek-messenger-window').addClass('minimized');

        if ($('#keek-messenger-bar').is(':visible')) {
            leftval = $('#keek-messenger-bar').position().left - $('#keek-messenger-window').width() - 4 - 20; //4 accounts for border on messaging window
        } else {
            leftval = $(window).width() - $('#keek-messenger-window').width() - 4 - 20; //4 accounts for border on messaging window
        }

        $('#keek-messenger-window').css({
            position: 'fixed',
            top: 'auto',
            bottom: 0,
            left: leftval
        });

        //prevent the chat-input field from appearing when switching browser tabs while the messenger is minimized
        $('#messenger-view-wrapper').hide();

        if (isFromButton) this.minimizedBeforeResizeThreshold = true;
    },

    maximizeMessageWindow: function(isFromButton) {
        var $window = $(window),
            $messengerWindow = $('#keek-messenger-window'),
            savedPosition = this.getSavedMessengerWindowPosition(),
            defaultPosition = this.getDefaultMessengerWindowPosition();
        
        // Initialize the messenger view
        // Set the "messenger.minimized" to false
        localStorage.setItem('messenger.minimized', 'false');
        
        // Remove the 'minimized' class
        $messengerWindow.removeClass('minimized');
        
        // Make it draggable
        this.draggableEnabled = true;
        
        
        // rePositioning
        if($window.height() < $messengerWindow.height()){
            $messengerWindow.css({
                top: 0,
                bottom: 'auto',
                left: defaultPosition.left
            });
        } else if (savedPosition.left > $window.width() || (savedPosition.top + $messengerWindow.outerHeight()) > $window.height()) {
            $messengerWindow.css({
                top: $window.height() - $messengerWindow.height() - 4,
                bottom: 'auto',
                left: defaultPosition.left
            });
        } else {
            $messengerWindow.css({
                top: savedPosition.top,
                bottom: 'auto',
                left: savedPosition.left
            });
        }
        
        // Display and restore the title
        $('#messenger-view-wrapper').show();
        // Restore the title
        this.restoreTitle();

        if (isFromButton) this.minimizedBeforeResizeThreshold = false;
    },
    
    getSavedMessengerWindowPosition: function() {
        return this.localStorageCheck() ? JSON.parse(localStorage.getItem('messenger.position')) : this.messenger_window_pos;
    },
    
    getDefaultMessengerWindowPosition: function() {
        var top, left;

        if ($('#keek-messenger-bar').length > 0) {
            top = $('#keek-messenger-bar').position().top + ($('#keek-messenger-bar').height() - $('#keek-messenger-window').height());
            left = $('#keek-messenger-bar').position().left - $('#keek-messenger-window').width() - 4; //4 accounts for border on messaging window
        } else {
            top = $(window).height() - $('#keek-messenger-window').height() - 4;
            left = $(window).width() - $('#keek-messenger-window').width() - 4;
        }

        return { top: top, left: left };
    },

    navigateForward: function(opts) {
        var target, referrer;

        this.views.conversationView.typingStatus = false;

        if (!opts || !opts.target) {
            throw new Error('navigateForward: No target view specified');
        }

        if (this.views.conversationView.updateMessengerPoll) {
            this.views.conversationView.lastPoll = true;
        }
        
        //Record History and store it
        if (!opts.isDefault) {
            if (this.currentHistoryIndex === this.history.length - 1) {
                //A new view in the route is being navigated to
                this.history.push({
                    view: opts.target.viewName,
                    buttonToDisplay: opts.navButtonOverride ? opts.navButtonOverride : opts.target.headerNavigationType,
                    referrer: opts.referrer.viewname
                });
            } else {
                //If the view we are navigating to is not the next view in the stack, create a new route
                //We are not at the end of the stack, and there is at least one view next in the stack. We could also be at the beginning of the stack.
                //Remove all of the elements from the stack that area ahead of the current index
                this.history = this.history.slice(0, this.currentHistoryIndex + 1);
                //Push the new last element in the stack to the stack
                this.history.push({
                    view: opts.target.viewName,
                    buttonToDisplay: opts.navButtonOverride ? opts.navButtonOverride : opts.target.headerNavigationType,
                    referrer: opts.referrer.viewname
                });
            }
            if (this.localStorageCheck()) {
                localStorage.setItem('messenger.current_view', opts.target.$el.prop('id'));
            }
            this.currentHistoryIndex = this.currentHistoryIndex + 1;
            this.storeHistory();
            opts.target.active = true;
            
            this.updateNavButtons(opts.target, opts.referrer, opts.navButtonOverride ? opts.navButtonOverride : '');
            this.slideLeft(opts.target.$el, opts.referrer.$el, opts.target.fetch ? opts.target.fetch : '');
        } else {
            if (this.localStorageCheck()) {
                localStorage.setItem('messenger.current_view', opts.target.$el.selector.replace('#', ''));
            }

            $('#messenger-view-wrapper-inside').empty();
            $(opts.target.$el.selector).appendTo($('#messenger-view-wrapper-inside'));
            this.updateNavButtons(opts.target, opts.referrer, opts.navButtonOverride ? opts.navButtonOverride : '');
        }
        
        // Reset the title
        this.restoreTitle();
    },

    navigateBack: function(opts) {
        var target, referrer;

        this.views.conversationView.typingStatus = false;

        if (!opts) opts = {};

        if (this.lastPoll){
            $('#messenger-typing-title').hide();
            $('#messenger-title').show();
        }        
        
        if (opts.target) {
            //A specific target to go back to has been defined
            //Not sure what to do with history here
            referrer = opts.referrer;
            target = opts.target;
            
            this.updateNavButtons(opts.target, opts.referrer);
        } else {
            //Use history to define where the target is
            var historyObj = this.history[this.currentHistoryIndex - 1];
            referrer = this.getCurrentViewObject();
            
            if (historyObj) {
                target = _.find(this.views, function(view) {
                    return view.viewName === historyObj.view;
                });
            } else {
                target = _.find(this.views, function(view) {
                    return view.viewName === referrer.defaultNavigationTarget;
                });
            }
            
            this.currentHistoryIndex = this.currentHistoryIndex - 1;
            this.storeHistory();
            this.updateNavButtons(referrer);
        }
        
        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.current_view', target.$el.prop('id'));
        }

        this.views.conversationView.lastPoll = true;

        target.active = true;
        
        this.restoreTitle();
        
        this.slideRight(target.$el, referrer.$el, target.fetch ? target.fetch : '');
    },

    landingPageNavigateForward: function(opts) {
        var target, referrer;

        if (!opts || !opts.target) {
            throw new Error('navigateForward: No target view specified');
        }

        this.views.conversationView.typingStatus = false;

        if (this.views.conversationView.updateMessengerPoll) {
            this.views.conversationView.lastPoll = true;
        }

        //Record History and store it
        if (!opts.isDefault) { 
            if (this.currentHistoryIndex === 1){
                this.history = this.history.slice(0, this.currentHistoryIndex);
            }else{
                this.history = this.history.slice(0, this.currentHistoryIndex + 1);
            }
            //Push the new last element in the stack to the stack
            this.history.push({
                view: opts.target.viewName,
                buttonToDisplay: opts.navButtonOverride ? opts.navButtonOverride : opts.target.headerNavigationType,
                referrer: opts.referrer.viewname
            });

            if (this.localStorageCheck()) {
                localStorage.setItem('messenger.current_view', opts.target.$el.prop('id'));
            }

            if (this.currentHistoryIndex === 0){
                this.currentHistoryIndex = this.currentHistoryIndex + 1;
            }else if (this.currentHistoryIndex > 1){
                this.currentHistoryIndex = 1;
            }

            this.storeHistory();
            
            this.updateNavButtons(opts.target, opts.referrer, opts.navButtonOverride ? opts.navButtonOverride : '');
            this.fadeInSlide(opts.target.$el, opts.referrer.$el, opts.target.fetch ? opts.target.fetch : '');
        }
    },

    navigateToOrigin: function(opts) {
        var target, referrer;

        if (!opts) opts = {};

        this.views.conversationView.typingStatus = false;

        //Use history to define where the target is
        var historyObj = this.history[0];
        referrer = this.getCurrentViewObject();

        if (historyObj) {
            target = _.find(this.views, function(view) {
                return view.viewName === historyObj.view;
            });
        }

        this.currentHistoryIndex = 0;
        this.storeHistory();
        this.updateNavButtons(referrer);

        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.current_view', target.$el.prop('id'));
        }

        if (this.views.conversationView.updateMessengerPoll) {
            this.views.conversationView.lastPoll = true;
        }

        target.active = true;
        
        this.slideRight(target.$el, referrer.$el, target.fetch ? target.fetch : '');
    },

    //Handles the silent loading of a view. Can support a transition from any view to another.
    loadViewSilent: function(target, referrer, updateHistoryFromStorage) {
        var targetViewObj, referrerViewObj;

        //Find view objects for the target and referrer
        targetViewObj = _.find(this.views, function(view) {
            return view.viewName === target.view;
        });

        referrerViewObj =_.find(this.views, function(view) {
           return view.viewName === referrer.view;
        });

        if (updateHistoryFromStorage) {
            //Update history object and history index stored in memory in order to reflect proper state.
            //This is triggered from the storage event on the window object.
            this.history = JSON.parse(localStorage.getItem('messenger.history'));
            this.currentHistoryIndex = parseInt(localStorage.getItem('messenger.history.index'), 10);
        }

        this.updateNavButtons(targetViewObj, referrerViewObj);

        if (this.views.conversationView.updateMessengerPoll) {
            clearInterval(this.views.conversationView.updateMessengerPoll);
            this.views.conversationView.updateMessengerPoll = null;
        }

        target.active = true;
        
        this.fadeInSlide(targetViewObj.$el, referrerViewObj.$el, targetViewObj.fetch ? targetViewObj.fetch : '');
    },

    loadDefaultView: function() {
        var parent = this.options.parent;
        var default_view_id = this.views.conversationListView.$el.selector.replace('#', ''); //Hardcoding in conversationListView as the default view
        this.loadInitialView(default_view_id, { isDefault: true });
    },

    loadInitialView: function(viewId, opts) {
        //Sets view as active to allow data to be pulled
        var viewToDisplay;
        var self = this;

        $.each(App.Views, function() {
            if (this.prototype.el && this.prototype.el.selector === '#' + viewId) {
                viewToDisplay = this.prototype.el.selector;
            }
        });

        $.each(this.views, function() {
            if (this.$el.selector === viewToDisplay) {
                if (opts.isDefault) {
                    this.parent.navigateForward({
                        target: this,
                        referrer: '',
                        isDefault: true
                    });
                }
                if (!self.preventInitialFetch) {
                    this.fetch();
                } else {
                    self.preventInitialFetch = false;
                }
                return false;
            }
        });
    },

    //Slides the currently displayed view left and replaces it with a new view
    slideLeft: function(toView, fromView, callback) {
        var elemOnStage = $('#messenger-view-wrapper-inside').find($(toView));
        var viewWidth = $('.messenger-view').width();
        var toViewObj = _.find(this.views, function(view) {
            return view.$el == toView;
        });
        var self = this;

        this.showLoadingIndicator();

        if (toViewObj && toViewObj.resetUI) toViewObj.resetUI();

        toView.appendTo($('#messenger-view-wrapper-inside'));
        toView.css('left', viewWidth);

        fromView.animate({left: '-=' + viewWidth}, { duration: 350, queue: false });

        if (toViewObj && toViewObj.resetUI) toViewObj.resetUI();

        toView.animate({left: '0'}, { duration: 350, queue: false, complete: function() {
            fromView.appendTo($('#keek-messenger-view-staging'));
            if (callback && toViewObj) toViewObj.fetch();
        }});
    },

    //Slides the currently displayed view right and displays a new view
    slideRight: function(toView, fromView, callback) {
        var elemOnStage = $('#messenger-view-wrapper-inside').find($(toView));
        var viewWidth = $('.messenger-view').width();
        var toViewObj = _.find(this.views, function(view) {
            return view.$el == toView;
        });
        var self = this;
        var conversationList = this.views.conversationListView;

        var slideViews = function() {
            //Show loading indicator in all cases unless the toView is the conversation list view and the conversationListView's collection is empty
            if (toView === self.views.conversationListView.$el) {
                if (self.views.conversationListView.collection.length === 0) {
                    self.showLoadingIndicator();
                    toViewObj.resetUI();
                }
            } else {
                self.showLoadingIndicator();
            }

            toView.prependTo($('#messenger-view-wrapper-inside'));
            toView.css('left', viewWidth * -1);

            fromView.animate({left: viewWidth}, { duration: 350, queue: false });

            if (self.getCurrentViewObject() === conversationList && conversationList.scrollTop) {
                $('.messenger-view-inside-scroll .content', conversationList.el).scrollTop(conversationList.scrollTop);
            }

            toView.animate({left: 0}, { duration: 350, queue: false, complete: function() {
                fromView.appendTo($('#keek-messenger-view-staging'));
                if (callback && toViewObj) toViewObj.fetch();
            }});
        };

        var checkIfAnimating = function() {
            if (toView.is(':animated')) {
                _.delay(checkIfAnimating, 100);
            } else {
                slideViews();
            }
        };

        //Call a check to see if the view to transition to is animating. If it is, we'll recursively set up a delay to call itself again in 100 ms.
        //If it is not animating, we'll call slideViews() in order to trigger the animation and loading of the target view.
        checkIfAnimating();
    },

    fadeInSlide: function(toView, fromView, callback) {
        var elemOnStage = $('#messenger-view-wrapper-inside').find($(toView));
        var toViewObj = _.find(this.views, function(view) {
            return view.$el == toView;
        });
        var self = this;

        this.showLoadingIndicator();

        if (toViewObj && toViewObj.resetUI) toViewObj.resetUI();

        toView.appendTo($('#messenger-view-wrapper-inside'));
        $('#messenger-conversation').css('left', '0px');
        $('#messenger-new-message').css('left', '0px');

        if (toViewObj && toViewObj.resetUI) toViewObj.resetUI();

        toView.fadeIn(1000, function(){
            fromView.appendTo($('#keek-messenger-view-staging'));
            // if (callback) callback();
            if (callback && toViewObj) toViewObj.fetch();
        });
    },

    restoreTitle: function() {
        var maxNumOfPending = 99,
            pendingMessages = this.model.get('priv'),
            $messengerTitle = $('.messenger-window-header #messenger-title'),
            currentViewObj = this.getCurrentViewObject(),
            currentView = this.getCurrentViewName(),
            titleText = currentViewObj.title || '';

        // Hide the typing title
        $('#messenger-typing-title').hide();
        
        if (currentViewObj && currentView) {
            switch (currentView) {
                case 'messenger-user-list':
                    if (pendingMessages > 0 && pendingMessages <= maxNumOfPending) {
                        titleText += ' (' + pendingMessages + ')';
                    }
                    
                    if (pendingMessages > maxNumOfPending) {
                        titleText += ' (' + maxNumOfPending + '+)';
                    }
                break;
                
                case 'messenger-profile':
                    titleText = currentViewObj.model.get('username');
                break;
            }
        }
        
        // Apply the text to title
        $messengerTitle.html(titleText).show();
    },
    
    changeTitle: function(title) {        
        var $messengerTitle = $('#messenger-title'),
            $minimizedTitle = $('#messenger-minimized-title'),
            $typingTitle = $('#messenger-typing-title');
        var pendingMessages;
        
        $typingTitle.addClass('hidden');

        //If we're on the conversation view, we need to check if the messenger is minimized. If it is, we've been tracking the number
        //of new messages 

        if(localStorage.getItem('messenger.minimized') === 'true' || $('.messenger-resize-btn').hasClass('maximize')){
            if (this.viewName === 'messenger') {
                pendingMessages = this.model.get('priv');
            } else {
                pendingMessages = this.parent.model.get('priv');
            }

            if (this.getCurrentViewObject() === this.views.conversationView) {
                //Add in the number of messages
            }

            if (pendingMessages >= 99) {
                $minimizedTitle.html('Messages (99+)');
            } else if (pendingMessages > 0){
                $minimizedTitle.html('Messages (' + pendingMessages + ')');
            } else {
                $minimizedTitle.html('Messages');
            }

            $messengerTitle.hide();
            $minimizedTitle.show();
        }

        // If current view is 'conversationView', set the current title to empty.
        var _title = (this.viewName == 'conversationView' && this.views[this.viewName].inMessageRequestState) ? '' : title;

        $messengerTitle.text(_title);
    },

    //http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript
    numberWithCommas: function(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },

    updateBadges: function() {
        //Called generally from global.js after /update_notifications is hit. We also handle the recent_left_conversations value here
        //to remove any recently left conversations from the conversation list

        var numPending = this.model.get('priv');
        var prevNumPending = this.model.previousAttributes().priv;
        var notif = this.model.get('notif');
        var subs = this.model.get('subs');
        var keekMailTotal = notif + subs + numPending;
        var minimizedTitle = $('.messenger-window-header #messenger-minimized-title');
        var messengerTitle = $('.messenger-window-header #messenger-title');
        var recentlyLeftConvos = this.model.get('recent_left_conversations');

        if (numPending === 0) {
            //Reset back to 'Messages' state
            $('#messenger-nav-messages').html('Messages');
            $("#header-notif-messages").hide();
            $('.header-notif-btn.messages-btn').removeClass('active');

            $('#messenger-landing-notif-messages').hide();
            $('#keekmail-notif').show().html(this.numberWithCommas(keekMailTotal));

            minimizedTitle.html('Messages');
            messengerTitle.html('Messages');
        } else if (numPending > 0) {
            $("#header-notif-messages").show()
                .html(this.numberWithCommas(numPending));
            $('.header-notif-btn.messages-btn').addClass('active');
            $('#messenger-landing-notif-messages').show().html(this.numberWithCommas(numPending));
            $('#keekmail-notif').show().html(this.numberWithCommas(keekMailTotal));
            minimizedTitle.html('Messages (' + numPending + ')');

            if (localStorage.getItem('messenger.current_view') === 'messenger-user-list'){
                messengerTitle.html('Messages (' + numPending + ')');
            }

            if (numPending >= 99) {
                //Mes...(99+)
                $('#messenger-nav-messages').html('Mes...(99+)');
                minimizedTitle.html('Messages (99+)');

                if (localStorage.getItem('messenger.current_view') === 'messenger-user-list'){
                    messengerTitle.html('Messages (99+)');
                }
            } else if (numPending >= 10 && numPending < 99) {
                //Mess...(10)
                $('#messenger-nav-messages').html('Mess...(' + numPending + ')');
            } else {
                //Mess...(1)
                $('#messenger-nav-messages').html('Mess...(' + numPending + ')');
            }
        }

        if (keekMailTotal === 0){
            $('#keekmail-notif').hide();
        }

        if (recentlyLeftConvos && recentlyLeftConvos.length > 0) {
            var conversationListView = this.views.conversationListView;
            var messengerLandingView = this.views.messengerLandingView || null;

            //Go through each recently left conversation id
            _.each(recentlyLeftConvos, function(conversation) {
                //Is there anything in the conversation list collection and is this conversation in the conversation list?
                if (conversationListView.collection.length > 0) {
                    var listViewModel = conversationListView.collection.find(function(c) {
                        return c.get('conversation_id') === conversation;
                    });
                    conversationListView._MessageViews[listViewModel.get('conversation_id')].remove();
                    listViewModel.remove();
                }

                //Does the messengerLandingView exist and is this conversation in the messenger landing list?
                if (messengerLandingView) {
                    var landingViewModel = messengerLandingView.collection.find(function(c) {
                        return c.get('conversation_id') === conversation;
                    });
                    messengerLandingView._MessageViews[landingViewModel.get('conversation_id')].remove();
                    landingViewModel.remove();
                }
            });

            if (conversationListView.collection.length === 0) {
                conversationListView.setNoContentState();
            }
        }
    },

    playNotificationSound: function() {
        if (this.audioEnabled) {
            soundManager.play('received');
        }
    },

    playWhisperSound: function() {
        if (this.audioEnabled) {
            soundManager.play('received');
        }
    },

    getCurrentViewName: function() {
        if (this.localStorageCheck()) {
            return localStorage.getItem('messenger.current_view');
        } else {
            return false;
        }
    },

    getCurrentViewObject: function() {
        var current_view = this.getCurrentViewName();
        var viewObj;
        $.each(this.views, function(obj) {
            if (this.$el.prop('id') === current_view) {
                viewObj = this;
                return false;
            }
        });
        return viewObj;
    },

    getUsersInConversation: function() {
        return this.conversation.get('users');
    },
    
    showLoadingIndicator: function() {
        $('#messenger-loading').fadeIn('fast');
    },

    hideLoadingIndicator: function() {
        $('#messenger-loading').fadeOut('fast');
    },

    handleRecorderOutput: function(file_id, duration) {
        //This function's purpose is to catch the call from the Flash and re-route it to either the conversation view
        //or the new message view.
        var currentView = this.getCurrentViewObject();
        if (currentView === this.views.conversationView) {
            this.views.conversationView.handleRecorderOutput(file_id, duration);
        } else if (currentView === this.views.newMessageView) {
            this.views.newMessageView.handleRecorderOutput(file_id, duration);
        }
    },

    localStorageCheck: function() {
        return typeof window.localStorage != 'undefined';
    },

    conversationUnavailableModal: function() {
        //Return to conversation list
        this.navigateBack({
            target: this.views.conversationListView,
            referrer: this
        });

        //Display a modal saying the conversation is no longer available
        this.modal.alert('This conversation is no longer available', [{
            buttonClass: 'ok'
        }]);
    },

    resize: function() {
        var messenger_pos;

        var messengerCssTop = $('#keek-messenger-window').css('top');
        var window_size = {
            width: $(window).width(),
            height: $(window).height()
        };
        var messengerWindowWidth = $('#keek-messenger-window').width();

        var checkWindowHeight = function() {
            //Check to see if there is enough window height to display the messenger
            var msgWindow = $('#keek-messenger-window');
            if ((parseInt(msgWindow.css('top'), 10) + msgWindow.height()) > window_size.height) {
                return true;
            } else {
                return false;
            }
        };

        if ($(window).width() < 560) {
            if (!$('#keek-messenger-window').hasClass('minimized') && !this.minimizedBeforeResizeThreshold){
                this.toggleMessenger();
            }
        } else {
            //If we've transitioned from < 560 to > 560, maximize the messenger if it wasn't minimized before going <560
            if (!this.minimizedBeforeResizeThreshold && $('#keek-messenger-window').hasClass('minimized')) {
                this.toggleMessenger();
            }

            messenger_pos = $('#keek-messenger-window').position();
            if ($('#keek-messenger-window').hasClass('minimized')) {
                $('#keek-messenger-window').css({
                    left: Math.round(window_size.width - $('#keek-messenger-window').width() - 20 - 4),
                    top: 'inherit',
                    bottom: '0'
                });
            } else {
                var resizePosition;

                if ((messenger_pos.left + messengerWindowWidth) >= window_size.width) {
                    resizePosition = window_size.width - messengerWindowWidth;
                } else {
                    resizePosition = (messenger_pos.left/window_size.width) * 100 + '%';
                }

                $('#keek-messenger-window').css('left', Math.round(resizePosition));

                if (messengerCssTop.indexOf('%') === -1) {
                    //User has not resized window
                    $('#keek-messenger-window').css('top', Math.round((parseInt(messengerCssTop, 10)/window_size.height) * 100 + '%'));
                }
            }

            if (this.localStorageCheck() && messenger_pos.top >= 0 && messenger_pos.left >= 0) {
                localStorage.setItem('messenger.position', JSON.stringify(messenger_pos));
            }

            if (messenger_pos.left > window_size.width || checkWindowHeight()) {
                if (!$('#keek-messenger-window').hasClass('minimized')) {
                    //Hijacking the minimizedBeforeReiszedThreshold logic as it fits in this situation. If we don't do this,
                    //the messenger will maximize when it hits the else block for the width < 560 check.
                    this.minimizedBeforeResizeThreshold = true;
                    this.toggleMessenger();
                }

                if (this.localStorageCheck()) {
                    localStorage.setItem('messenger.position', JSON.stringify(this.getDefaultMessengerWindowPosition()));
                }
            }
        }
    },

    updateNavButtons: function(target, referrer, navButtonOverride) {
        if (this.history.length > 0) {
            //Get the currentHistoryIndex entry and set the nav buttons to use that view's details
            var current = this.history[this.currentHistoryIndex];
            var currentViewObj;

            if (!current) {
                this.resetHistory();
            } else {
                $.each(this.views, function(key, val) {
                    if (current.view === key) {
                        currentViewObj = this;
                        return false;
                    }
                });
                this.views.navigationView.model.set({
                    current: navButtonOverride ? navButtonOverride : currentViewObj.headerNavigationType,
                    target: currentViewObj,
                    referrer: referrer
                });
            }
        } else {
            //There's no history. We need to use the target's default navigation route
            var defaultNavTarget = target.defaultNavigationTarget;
            var defaultNavTargetObject;

            //if there's multiple navigation targets, match the navigation target to the referring view object


            //Target needs to be default navigation target
            //Go through list of views looking for the one that matches the view name for defaultNavigationTarget

            if (typeof defaultNavTarget === 'object') {
                for (var i in defaultNavTarget) {
                    //Referring view dictates the target we should be using
                    //find the referring view and use that view name for the key search
                    //The unique identifiers don't match

                    $.each(this.views, function(key, val) {
                        if (defaultNavTarget === this.viewName) {
                            defaultNavTargetObject = this;
                            return false;
                        }
                    });

                    if (navigationTarget) break;
                }
            } else {
                $.each(this.views, function(key, val) {
                    if (defaultNavTarget === key) {
                        defaultNavTargetObject = this;
                        return false;
                    }
                });
            }
            this.views.navigationView.model.set({
                current: navButtonOverride ? navButtonOverride : target.headerNavigationType,
                target: defaultNavTargetObject,
                referrer: referrer
            });
        }
    },

    storeHistory: function() {
        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.history', JSON.stringify(this.history));
            localStorage.setItem('messenger.history.index', this.currentHistoryIndex);
        }
    },

    historyFallback: function() {
        //Reset history
        this.resetHistory();

        //Load default view
        this.loadDefaultView();
    },

    resetHistory: function() {
        this.history = [];
        this.currentHistoryIndex = 0;

        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.history', JSON.stringify(this.history));
            localStorage.setItem('messenger.history.index', this.currentHistoryIndex);
        }
    },
    
    //Derived from:
    /**
     * jquery.bidi.js -- set dir attribute based on first strongly
     * directional character in text
     *
     * Alaa Abd El Fattah
     *
     */
    bidi: function(text) {
        NOT_UNICODE_LETTER = /[^\u0041-\u005A\u0061-\u007A\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u0523\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0621-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971\u0972\u097B-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D28\u0D2A-\u0D39\u0D3D\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC\u0EDD\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8B\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10D0-\u10FA\u10FC\u1100-\u1159\u115F-\u11A2\u11A8-\u11F9\u1200-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u1676\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19A9\u19C1-\u19C7\u1A00-\u1A16\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200F\u2071\u207F\u2090-\u2094\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2C6F\u2C71-\u2C7D\u2C80-\u2CE4\u2D00-\u2D25\u2D30-\u2D65\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31B7\u31F0-\u31FF\u3400\u4DB5\u4E00\u9FC3\uA000-\uA48C\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA65F\uA662-\uA66E\uA67F-\uA697\uA717-\uA71F\uA722-\uA788\uA78B\uA78C\uA7FB-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA90A-\uA925\uA930-\uA946\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAC00\uD7A3\uF900-\uFA2D\uFA30-\uFA6A\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/g;
        UNICODE_RTL = /^[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u200F]/;

        if (!text)
            return false;

        if (text && UNICODE_RTL.test(text)) {
            return 'rtl';
        } else {
            return 'ltr';
        }
    },

    trackView: function(viewEvent) {
        _gaq.push(['_trackEvent', '/' + this.currentUserId + '/' + viewEvent, 'click']);
    }
});

var NavigationButtonModel = Backbone.Model.extend({
    defaults: function() {
        return {
            current: null,
            target: null,
            referrer: null
        };
    }
});


App.Views.Navigation = App.Views.Messenger.extend({
    //Navigation and history
    //Keeps track of the route the user has taken through the application, and handles the functionality of navigation buttons
    //used by the messenger (eg. Back, Cancel, and Messages).

    //When this.loadView is called, the history should be updated to change the currentIndex of the history and to add to/change the route.

    //For the navigation buttons, each view should handle the display of its navigation button when it is being rendered. Clicking one of these buttons will
    //consult the history to get the view it needs to navigate to. If there is no history available (user agent does not support localStorage or user has disabled it),
    //each view should provide a default view that it should navigate to.

    //originView: this.views.conversationListView, //Origin view is the furthest back the user can navigate in the messenger
    el: $('.messenger-header-btn-group.left-group'),
    model: new NavigationButtonModel(),
    history: [],
    currentIndex: 0,
    events: {
        'click .messenger-header-btn': 'navigate'
    },
    initialize: function() {
        _.bindAll(this, "render");
        this.parent = this.options.parent;
        this.model.bind('change', this.render);

        //If there is an existing history cache in local storage, grab it and set it to this.history
        if (this.localStorageCheck() && localStorage.getItem('messenger.history')) {
            this.history = JSON.parse(localStorage.getItem('messenger.history'));
            this.currentHistoryIndex = parseInt(localStorage.getItem('messenger.history.index'), 10);
        } else {
            //No history stored, assume that the user has started on origin
            this.originView = this.views.conversationListView;

            //Place the origin view as element 0 in the history hash
            this.history.push({
                view: this.originView.viewName,
                buttonToDisplay: this.originView.headerNavigationType,
                referrer: null
            });
        }
    },
    render: function() {
        var current = this.model.get('current');
        
        // Call hide method
        this.hide();
        
        if (localStorage.getItem('messenger.minimized') !== 'true') {
            // '#messenger-nav-messages', '#messenger-nav-back', '#messenger-nav-cancel'
            if (current) {
                $('#messenger-nav-' + current).show();
            }
        }
    },
    hide: function() {
        this.$el.find('.messenger-header-btn').hide();
    },
    navigate: function(e) {
        if (e) e.preventDefault();

        if (this.model.get('overrideTarget')) {
            this.model.set({ 'target': overrideTarget });
        }

        $('#messenger-modal').hide();
        $('.messenger-modal-inside').hide();

        //At the moment, the navigation buttons only handle back actions.
        localStorage.setItem('messenger.profile.userId', '');
        this.parent.navigateBack();
    }
});

//Custom alert modal
//Backbone view bound to an element to be used as a modal. The initializeModal function will be used to reset the state
//of the modal before every use. This view is instantiated as a property of the main Messenger view. It can be accessed through
//MessengerMain.modal.
//USAGE - To use the modal, a reference to the Messenger view must be created and the modal must be accessed through there.
//        E.G. this.modal.alertModal(...) or App.Messenger.modal.alertModal(...)
App.Views.Modal = App.Views.Messenger.extend({
    events: {
        'click a.ok' : 'fadeOutOverlay'
    },
    initialize: function() {
        this.parent = this.options.parent;
        this.initializeModal();
    },
    render: function() {
        return this;
    },
    showOverlay: function() {
        $('#messenger-modal').fadeIn(250, function() {
            $('#messenger-modal-overlay').show();
        });
    },
    hideOverlay: function(e) {
        if (e) e.preventDefault();
        this.$el.hide();
        $('#messenger-modal').hide();
        $('.messenger-modal-inside').hide();
    },
    fadeOutOverlay: function(e) {
        if (e) e.preventDefault();
        $(e.target).trigger('modal-click');
        this.$el.hide();
        $('.messenger-modal-inside').hide();
        $('#messenger-modal').fadeOut(250, function() {
            $('#new-message-input_tag').focus();
        });
    },
    initializeModal: function() {
        //Clear existing text
        $('#messenger-modal-overlay .modal-text').text('');

        //Unbind existing event listener(s) if necessary
        $('#messenger-modal-overlay a.button').off('modal-click');

        //Hide buttons
        $('#messenger-modal-overlay a.button').hide();

    },
    alert: function(text, callback) {
        this.initializeModal();
        $('#messenger-modal-overlay .modal-text').text(text);
        $('#messenger-modal-overlay a.ok').show();
        this.showOverlay();

        //If there needs to be a callback on one of the buttons, we need to handle that.
        if (callback) {
            _.each(callback, function(target) {
                var btnElem = $('#messenger-modal-overlay').find('.' + target.buttonClass);

                //Create a custom event that is bound to this element and is fired on the default action for that button
                //EG If it's OK or Cancel, trigger that custom event in hideOverlay or fadeOutOverlay, whichever is being used
                if (btnElem.length > 0) {
                    //Bind the callback to that element
                    //TODO:  ********THIS ISN'T RIGHT YET********//
                    btnElem.off('modal-click');
                    btnElem.bind('modal-click', target.callback);
                }
            });
        }
    }
});

//*** Conversation List
//*******************************************
var ActiveConversations = Backbone.Collection.extend({
    model: ConversationModel,
    comparator: function(conversation) {
        var updated = conversation.get('last_updated');

        //Negative sign means sort ascending
        //return [conversation.get('messages_pending'), -updated]; //Sort by date ascending, group by pending
        return -updated; //Sort by date ascending
    }
});

App.Views.ConversationList = App.Views.Messenger.extend({
    el: $('#messenger-user-list'),
    tagName: "div",
    viewName: 'conversationListView',
    collection: new ActiveConversations(),
    defaultTransition: 'right',
    title: 'Messages',
    active: false,
    headerNavigationType: '',
    defaultNavigationTarget: '',
    amountConversationsToPull: 50,
    scrollTop: null,
    loadMoreEl: null,
    events: {
        'click a#new-message': 'openNewMessage',
        'click #conversation-list-load-more': 'loadMoreConversations'
    },

    initialize: function() {
        this.parent = this.options.parent;
        if (this.localStorageCheck()) {
            this.scrollTop = parseInt(localStorage.getItem('messenger.conversationListView.scrollTop'), 10);
        }
        function reverseSortBy(sortByFunction) {
          return function(left, right) {
            var l = sortByFunction(left);
            var r = sortByFunction(right);

            if (l === void 0) return -1;
            if (r === void 0) return 1;

            return l < r ? 1 : l > r ? -1 : 0;
          };
        }
        //this.collection.comparator = reverseSortBy(this.collection.comparator); //We can bring this back if we need to group by pending

        this.loadMoreEl = $('#conversation-list-load-more');
        _.bindAll(this, "updateConversationList", 'add', 'remove', 'sortConversationItemViews');
        this._ConversationViews = {}; // view cache for further reuse
        this.listenTo(this.collection, 'add', this.add);
        this.listenTo(this.collection, 'remove', this.remove);
        this.listenTo(this.collection, 'change', this.sortConversationItemViews);
    },

    resetUI: function() {
        $('div.content-inside', this.el).empty();
    },

    fetch: function() {
        var self = this;
        
        self.polling = setInterval(function() {
            self.updateConversationList(self);
        }, self.parent.conversationsPollInterval);

        self.parent.trackView(this.parent.googleAnalyticsEvents.user_list);

        if (self.collection.length === 0) {
            Keek.api('/message/conversations', { number: this.amountConversationsToPull }, function(data) {
                if (data.status.code === 2000) {
                    var conversations = [];

                    $.each(data.conversations, function() {
                        var conversation = new ConversationModel(this);
                        conversations.push(conversation);
                    });
                    self.collection.reset();
                    self.collection.add(conversations);

                    if (data.more_older_conversations > 0) {
                        self.loadMoreEl.show();
                    }

                    self.render(true);
                } else {
                    console.error("Conversation List View Error: %s (%i)", data.status.message, data.status.code);
                }
            });
        } else {
            self.updateConversationList(self);
            self.render();
        }
    },

    render: function() {
        var self = this,
            title = 'Messages',
            spaceHTML = '&nbsp;';
        
        if(localStorage.getItem('messenger.current_view') === 'messenger-user-list'){
            var pendingMessages = self.model.get('priv');
            
            if (pendingMessages > 99) {
                title += spaceHTML + '(99+)';
            } else if (pendingMessages > 0) {
                title += spaceHTML + '(' + pendingMessages + ')';                
            }            
            
            $('.messenger-window-header #messenger-title').html(title);
        }

        if (self.collection.models.length === 0) {
            self.setNoContentState();
        }

        $('.messenger-view-inside-scroll', self.el).nanoScroller();

        $('.content', self.$el).off('scroll').on('scroll', function() {
            self.recordScrollPosition();
        });

        self.hideLoadingIndicator();

        return self;
    },

    setNoContentState: function() {
        $('div.content-inside', this.el).html("<div id='no-conversation'><p>You have no messages</p></div>");
    },

    //Handles the creation of a conversation list item view when a conversation model is added to the collection
    add: function(convo, collection) {
        var conversationItemView = new App.Views.ConversationItemView({
            model: convo,
            parent: this
        });

        this._ConversationViews[convo.get('conversation_id')] = conversationItemView;
        this.collection.sort();

        $('.messenger-view-inside-scroll div.content-inside', this.el).append(conversationItemView.render().el);

        if (collection.length === _.size(this._ConversationViews)) {
            this.sortConversationItemViews();
        }
    },

    remove: function(convo) {
        var conversation_id = convo.get('conversation_id');
        var listViewItem = this._ConversationViews[conversation_id];
        
        listViewItem.close();
        delete this._ConversationViews[conversation_id];
    },

    appendItem: function(item){
        if (!item.attributes.message) {
            item.set('message', '');
        }

        var conversationItemView = new App.Views.ConversationItemView({
            model: item,
            parent: this
        });

        $('.messenger-view-inside-scroll div.content-inside', this.el).append(conversationItemView.render().el);
    },

    openNewMessage: function(e) {
        e.preventDefault();
        var parent = this.options.parent;
        clearInterval(this.polling);
        this.parent.navigateForward({
            target: parent.views.newMessageView,
            referrer: this
        });
    },

    recordScrollPosition: function() {
        //Record the scroll position in the scrollable window in both local storage and in memoryv
        var scrollTop = $('.content', this.$el).scrollTop();
        this.scrollTop = scrollTop;
        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.conversationListView.scrollTop', scrollTop);
        }
    },

    updateConversationList: function(self) {
        //Requires the messenger to pass itself into the function as "self", as "this" becomes
        //Window when the function is run from setInterval()
        var newestConversation = self.collection.first();
        var newestConvoMessage, latestConversation;

        if (newestConversation) {
            newestConvoMessage = newestConversation.get('message');

            if (newestConvoMessage.details.caption || newestConvoMessage.details.video) {
                latestConversation = newestConvoMessage.created;
            } else {
                latestConversation = newestConversation.get('last_updated');
            }

            if (latestConversation) {
                Keek.api('/message/conversations', { since_date: latestConversation }, function(data) {
                    if (data.status.code === 2000) {
                        var conversations = data.conversations;

                        _.each(conversations, function(conversation) {
                            //If conversation is not already in the existing list of conversations, add it
                            var conversationExists = _.find(self.collection.models, function(convo) { return convo.get('conversation_id') === conversation.conversation_id; });
                            if (conversationExists) {
                                //Get existing conversation view object and update its model, triggering the list item view's change event
                                conversationExists.set(conversation);
                                self.collection.sort();
                            } else {
                                //Insert the conversation model at position 0 in the collection so it is written out first
                                self.collection.add(new ConversationModel(conversation), { at: 0 });
                            }

                            //If conversation is not already in the existing list of conversations on the messenger landing view, add it
                            var messengerLandingView = self.parent.views.messengerLandingView;
                            var conversationExistsLanding = messengerLandingView ? _.find(messengerLandingView.collection.models, function(convo) { return convo.get('conversation_id') === conversation.conversation_id; }) : null;
                            if (messengerLandingView) {
                                if (conversationExistsLanding) {
                                    //Get existing conversation view object and update its model, triggering the list item view's change event
                                    conversationExistsLanding.set(conversation);
                                    messengerLandingView.collection.sort();
                                } else {
                                    //Insert the conversation model at position 0 in the collection so it is written out first
                                    messengerLandingView.collection.add(new ConversationModel(conversation), { at: 0 });
                                }
                            }
                        });

                        self.parent.model.set('priv', data.unread_messages_count);
                    }
                });
            }
        }else if(self.collection.length === 0){
            Keek.api('/message/conversations', { since_date: latestConversation }, function(data) {
                if (data.status.code === 2000) {
                    var conversations = data.conversations;

                    _.each(conversations, function(conversation) {
                        //If conversation is not already in the existing list of conversations, add it
                        var conversationExists = _.find(self.collection.models, function(convo) { return convo.get('conversation_id') === conversation.conversation_id; });
                        self.collection.add(new ConversationModel(conversation), { at: 0 });

                        //If conversation is not already in the existing list of conversations on the messenger landing view, add it
                        var messengerLandingView = self.parent.views.messengerLandingView;
                        var conversationExistsLanding = messengerLandingView ? _.find(messengerLandingView.collection.models, function(convo) { return convo.get('conversation_id') === conversation.conversation_id; }) : null;
                        if (messengerLandingView) {
                            messengerLandingView.collection.add(new ConversationModel(conversation), { at: 0 });
                        }
                    });

                    if(self.collection.length > 0){
                        $('#no-conversation').hide();
                    }

                    self.parent.model.set('priv', data.unread_messages_count);
                }
            });
        }
    },

    loadMoreConversations: function(e) {
        e.preventDefault();

        //Get oldest conversation object
        var self = this;
        var oldestConversation = this.collection.last();
        var oldestConvoMessage = oldestConversation.get('message');
        var maxDate;

        self.loadMoreEl.find('.load-more-link').fadeOut();
        self.loadMoreEl.find('.loading').fadeIn();

        if (oldestConvoMessage.details.caption || oldestConvoMessage.details.video) {
            maxDate = oldestConvoMessage.created;
        } else {
            maxDate = oldestConversation.get('last_updated');
        }

        Keek.api('/message/conversations', { number: this.amountConversationsToPull, max_date: maxDate }, function(data) {
            if (data.status.code !== 2000) {
                console.error("Conversation List View Error: %s (%i)", data.status.message, data.status.code);
            } else {
                var conversations = [];

                if (data.conversations.length > 0) {
                    _.each(data.conversations, function(conversation) {
                        var alreadyInCollection = self.collection.find(function(existingConversation) {
                            return existingConversation.get('conversation_id') === conversation.conversation_id;
                        });

                        if (!alreadyInCollection) {
                            var conversationObj = new ConversationModel(conversation);
                            conversations.push(conversationObj);
                        }
                    });

                    self.collection.add(conversations);

                    if (data.more_older_conversations > 0) {
                        self.loadMoreEl.show();
                        self.loadMoreEl.find('.loading').fadeOut();
                        self.loadMoreEl.find('.load-more-link').fadeIn();
                    } else {
                        self.loadMoreEl.find('.loading').hide();
                        self.loadMoreEl.hide();
                    }

                    self.render(true);
                } else {
                    self.loadMoreEl.find('.loading').hide();
                    self.loadMoreEl.hide();
                }
            }
        });
    },

    sortConversationItemViews: function() {        
        var messageArea = $('div.content-inside', this.el);
        var copiedCollection = $.extend(true, [], this.collection.models);

        this.collection.sort();

        for(var i=0; i < this.collection.length; i++)
            copiedCollection[i] = this._ConversationViews[this.collection.models[i].get('conversation_id')].$el;

        for(var i=0; i < copiedCollection.length; i++) {
            messageArea.append(copiedCollection[i]);
            delete copiedCollection[i];
        }
    }
});

App.Views.ConversationItemView = Backbone.View.extend({
    tagName: 'div',
    template: _.template($('#tmpl-conversation-item').html()),
    events: {
        "click .view-message": "openConversation",
        'click .leave': 'leaveConversation',
        'click .delete': 'leaveConversation'
    },
    attributes : function () {
        return {
            'class': 'list-user user-list-user',
            id: this.model.get('conversation_id')
        };
    },
    initialize: function() {
        this.listenTo(this.model, 'change', this.render);
        this.parent = this.options.parent;
    },
    render: function() {
        var self = this;
        //Clone current convo model
        var clonedConversation = this.model.clone();

        this.determineCaption(clonedConversation);

        var usersWithoutCurrentUser = _.reject(this.model.get('users'), function(user) {
            return user.user_id === self.options.parent.options.parent.currentUserId;
        });

        clonedConversation.set({
            users: usersWithoutCurrentUser
        });

        this.$el.html(this.template(clonedConversation.toJSON()));
        if (this.model.get('messages_pending') > 0) {
            this.$el.addClass('message-pending');
        } else {
            this.$el.removeClass('message-pending');
        }
        
        // Add class 'small-icon' to the conversation item before rendering the list
        this.$el.find('.message img').addClass('small-icon');
        
        return this;
    },
    close: function() {
        //http://andrewhenderson.me/tutorial/how-to-detect-backbone-memory-leaks/
        this.model.unbind('change', this.render, this ); // Unbind reference to the model
        this.model.unbind('remove', this.remove, this ); // Unbind reference to the model
        
        // Remove the conversation item
        this.$el.remove();
        
        delete this.$el;
        delete this.el;
        this.unbind();
        this.stopListening();
    },
    determineCaption: function(model){
        if (model.get('message').details.state) {
            if (model.attributes.message.details.state === 'join'){
                var joinCaption = model.attributes.message.details.user.username + ' was added';
                model.set({message: { details: { caption: joinCaption }}});
            } else if (this.model.attributes.message.details.state === 'exit'){
                var exitCaption = model.attributes.message.details.user.username + ' has left';
                model.set({message:{ details: { caption: exitCaption }}});
            }
        }
    },
    openConversation: function(e) {
        if (!$(e.target).is('a')) {
            e.preventDefault();
            if ($(e.target).hasClass('message-action-button'))
                return false;

            var parent = this.options['parent'];
            var selected_convo_id = this.model.get('conversation_id');
            var conversationView = parent.parent.views.conversationView;
            var messengerLandingView = parent.parent.views.messengerLandingView;
            var self = this;
            var messengerLandingViewItem, usernameString = '', prevNumPending, messagesPendingInConv;

            $('.list-item', this.el).removeClass('message-pending');
            $('#' + selected_convo_id).removeClass('message-pending');

            clearInterval(this.parent.polling);

            parent.parent.conversation = this.model.clone();
            conversationView.conversation = this.model.clone();

            if (this.parent.localStorageCheck()) {
                localStorage.setItem('messenger.currentConversationId', selected_convo_id);
            }

            if (this.model.get('messages_pending') > 0) {
                prevNumPending = parent.parent.model.get('priv');
                messagesPendingInConv = this.model.get('messages_pending');

                parent.parent.model.set({ priv: prevNumPending - messagesPendingInConv });
                if ($('#header-notif-messages').exists()) {
                    if (prevNumPending - messagesPendingInConv === 0) {
                        $("#header-notif-messages").fadeOut('fast');
                        $("#header-notif-messages").parent().removeClass('active');
                    } else if (prevNumPending - messagesPendingInConv > 0) {
                        $("#header-notif-messages").html(prevNumPending - messagesPendingInConv);
                    }
                }

                this.model.set('messages_pending', 0);

                if (messengerLandingView){
                    var messengerLandingViewItem = messengerLandingView.collection.find(function(conversation) {
                        return conversation.get('conversation_id') === selected_convo_id;
                    });

                    messengerLandingViewItem.set('messages_pending', 0);
                }
            }
            
            conversationView.scrollTop = null;
            parent.parent.navigateForward({
                target: conversationView,
                referrer: parent
            });
        }
    },

    leaveConversation: function(e) {
        e.preventDefault();
        var type = $(e.target).hasClass('delete') ? 'delete' : 'leave';

        this.parent.parent.views.leaveConversationOverlayView.model.set({
            'type': type,
            'conversation_id': this.model.get('conversation_id'),
            'initiator': 'conversationListView',
            'num_participants': this.model.get('users').length
        });

        //Display Leave Conversation modal
        $('#messenger-modal').fadeIn(250, function() {
            $('#messenger-leave-convo-overlay').show();
        });
    }
});


//*** New Message view
//*******************************************
var Friends = Backbone.Collection.extend({
    model: UserModel,
    comparator: function(friend) {
        return friend.get('username');
    }
});

App.Views.NewMessage = App.Views.Messenger.extend({
    el: $('#messenger-new-message'),
    tagName: "div",
    viewName: 'newMessageView',
    collection: new Friends(),
    defaultTransition: 'left',
    title: 'New message',
    active: false,
    headerNavigationType: 'messages',
    defaultNavigationTarget: 'conversationListView',
    prevFilterTerm: '',
    allowFiltering: true,
    showLoadMoreOnReset: false,
    nextFilterPage: 0,
    selectedUsers: [],
    chatInput: null,
    messageSubmissionLocked: false,
    events:{
        'click .chat-send' : 'submitMessage',
        'click .open-tray' : 'toggleTray',
        'click .at-replies-tab' : 'openAtReplies',
        'click .emoticons-tab' : 'openEmoticons',
        'click .chat-input' : 'showActionTrayButton',
        'click a.tray-emoticon-link': 'selectEmoticon',
        'click .chat-input-outside': 'focusOnTextarea',
        'click #new-message-load-more': 'loadMoreUsers',
        'click #messenger-recorder-cancel-nm': 'hideRecorder',
        'click #new-message-record-private': 'openRecorder',
        'click #new-message-submit-search': 'searchUsers'
    },
    initialize: function() {
        var self = this;
        this.parent = this.options.parent;
        this.chatInput = $('.chat-input', this.$el);

        _.bindAll(this, "handleTrayMouseup");
        
        // Tag input
        newMessageSearch.init({
            localStore: true,
            maxRows: 2,
            rowHeight: 26,
            width: 200,
            contentWidth: 185,
            minInputWidth: 27,
            customEvents: {
                'keyup .input-tag-input': function(e) {
                    var keycode =  e.keyCode ? e.keyCode : e.which;
                    
                    if (keycode == 8 && $(this).val() == '') {
                        $('#new-message-users .content-inside', self.$el).empty();
                        $('#new-message-users').nanoScroller();
                    }
                    
                    if (keycode > 47 && keycode < 91) {
                        self.filterUsers($(this).val());
                    }
                }
            },
            onTagAdded: function() {
                if (this.tags.length) {
                    $('.input-tag-input').val('');
                    $(this.config.input).attr('placeholder', '');
                }
            },
            onTagRemoved: function() {
                var _ids = $.map(this.tags, function(_t) { return _t.id; });
                
                if (!_ids.length) {
                    $(this.config.input).css('width', '90%').attr('placeholder', this.config.placeHolder);
                    
                    // Hide the chatinput
                    $('.conversation-bottom-content', self.$el).hide();
                    // Empty the search results
                    $('#new-message-users .content-inside', self.$el).empty();
                    // Reset results list
                    $('#new-message-users').addClass('extended').nanoScroller();
                    // Reset the selectedUsers array
                    self.selectedUsers = [];
                }
                
                self.selectedUsers = $.grep(self.selectedUsers, function(_u) {
                    return $.inArray(_u.get('user_id'), _ids) !== -1;
                });
            },
            onSearchCompleted: function() {
                self.handleTagInput.call(self);
            }
        });
    },
    
    handleTagInput: function() {
        var self = this,
            _tags = newMessageSearch.tags,
            _users = newMessageSearch.users,
            _input = newMessageSearch.config.input;      
        
        // Reset friends list and empty the input field
        $('#new-message-users .content-inside', self.$el).empty();
        
        // Remove the current user from the search result
        delete _users[self.parent.currentUserId];
        
        // Max 35 friends
        if (self.selectedUsers.length > 35) {
            self.parent.modal.alert('You have reached the maximum number of users per conversation', [{
                buttonClass: 'ok'
            }]);
        } else {
            if ($.isEmptyObject(_users)) {
                // Show error msg
                self.setNoContentState();
            } else {
                var _list_users = [];
                
                // Display
                $.each(_users, function(_uid, _u) {
                    var tagAlreadyEntered = _.find(_tags, function(_tag) {
                        return (_tag.id === _uid);
                    });
                    
                    if (!tagAlreadyEntered) {
                        _list_users.push(new UserModel(_u));
                    }
                });
                
                if (_list_users.length) {
                    $.each(_list_users, function() {
                        self.appendFriend(this);
                        // Show the scroller bar
                        $('#new-message-users').nanoScroller();
                    })
                } else {
                    self.setSearchButtonState($(_input).val().replace(/(<.*?>)/ig,""));
                }
            }
        }
    },
    
    resetUI: function() {
        newMessageSearch.resetAll();
        
        $('.conversation-bottom-content', this.$el).hide();
        $('#new-message-users .content-inside', this.$el).empty();
        
        this.chatInput.val('');
        
        $('#messenger-keek-recorder-nm').hide();
        swfobject.removeSWF('main-recorder-nm');
    },

    //Override fetch to pull from Api.
    fetch: function(method, model, options) {
        this.selectedUsers = [];
        this.parent.trackView(this.parent.googleAnalyticsEvents.new_message);
        this.render();
    },
    render: function() {
        var self = this;
        var parent = this.options.parent;

        this.resetUI();
        
        if (this.selectedUserFromExternal) {
            this.addUserFromExternal();
        }
        
        $('#new-message-users, #tagsContent').nanoScroller({
            preventPageScrolling: true
        });

        $('#new-message-users').removeClass('short').addClass('extended');

        this.chatInput.off('keydown').keydown(function(e) {
            if (e.which === 13) {
                e.preventDefault();
            }
        });

        this.chatInput.off('keyup').keyup(function(e) {
            var text = self.chatInput.val();
            self.toggleSendButtonState(this);
            self.handleTextInputAutogrow(e);
            if (e.which === 13 && text.length > 0) {
                e.preventDefault();
                self.submitMessage(e);
            } else if (e.which === 13) {
                e.preventDefault();
            }

            if (self.parent.ie <= 9) {
                if (length > 0) {
                    $(this).prop('dir', self.parent.bidi(text));
                } else {
                    $(this).prop('dir', 'ltr');
                }
            }
        });

        this.chatInput.off('activate').on('activate', function() {
            var range, sel;
            if ( (sel = document.selection) && document.body.createTextRange) {
                range = document.body.createTextRange();
                range.moveToElementText(this);
                range.select();
            }
        });

        this.chatInput.off('blur').blur(function(){
            var sel;
            //Remove the range selection created on focus in order to properly remove focus from input.
            //Prevents an issue where clicking on the "Send" button while focusing on the input causes the cursor
            //to stay focused in the input.
            sel = window.getSelection();
            sel.removeAllRanges();
        });

        this.chatInput.off('cut paste').bind('cut paste', function(e) {
            self.toggleSendButtonState(this);
            self.handleTextInputAutogrow(e);
        });

        $('[placeholder]').blur();

        $(document).off('mouseup', self.handleTrayMouseup)
            .mouseup(self.handleTrayMouseup);
        
        this.changeTitle(self.getTitle());
        
        this.hideLoadingIndicator();

        return this;
    },
    
    getTitle: function() {
        return this.title || '';
    },
    
    hideLoadMoreOnDelete: function() {
        if($('#new-message-load-more').is(":visible") && $("#new-message-input_tag").val() === ""){
            $('#new-message-load-more').hide();
        }
    },
    loadMoreUsers: function(e) {
        var self = this;
        var prevFilterTerm = this.prevFilterTerm;
        var requestOpts;

        e.preventDefault();
        $('#new-message-more-link').fadeOut();
        $('#new-message-load-more .loading').fadeIn();

        requestOpts = {
            term: prevFilterTerm.replace(/(<.*?>)/ig,""), //Parse out HTML tags
            page: self.nextFilterPage,
            include_user_status: 1
        };

        Keek.api('/message/user_search', requestOpts, function(data) {
            if (data.status.code == 2000) {
                if (data.users.length > 0) {
                    var users = [];
                    $.each(data.users, function() {
                        var user = new UserModel(this);
                        if (user.get('user_id') !== self.parent.currentUserId) {
                            users.push(user);
                        }
                    });

                    var newMessageTo = $('#new-message-input').val();
                    _(users).each(function(user){ // in case collection is not empty
                        if(newMessageTo.indexOf(user.attributes.username) === -1) {
                            self.appendFriend(user);
                        }
                    }, this);

                    $('#new-message-users').nanoScroller({
                        preventPageScrolling: true
                    });
                } else {
                    self.allowFiltering = false;
                    self.setNoContentState();
                }

                if (data.paging) {
                    if (data.paging.next_page > 0) {
                        //Set the next filter page to be pulled down and show the Load More button
                        self.nextFilterPage = data.paging.next_page;
                        $('#new-message-load-more').show();
                        $('#new-message-load-more .loading').fadeOut();
                        $('#new-message-more-link').fadeIn();
                    } else {
                        //No pages remaining, hide the Load More button and reset the nextFilterPage
                        self.nextFilterPage = 0;
                        $('#new-message-load-more .loading').hide();
                        $('#new-message-more-link').show();
                        $('#new-message-load-more').fadeOut();
                        $('.content-inside .list-user:last-child', self.el).addClass('last');
                    }
                }
            }
        });
    },
    handleTextInputAutogrow: function(e) {
        //Handles autogrowing of textarea
        //Put text from chat-input textarea into a staging <p>. After, we'll take the CSS height of the staging <p> and apply it to the textarea's wrapping container.
        //Constrained at a max height of 56px because 56px should represent four lines of text, as discussed
        var stagingTag = $('.chat-input-stage', this.el);
        var chatInput = $('.chat-input', this.el);
        var refreshScroll = false;
        var maxCharacterCount = 444;

        stagingTag.text(chatInput.val());

        //Handle growing/shrinking the text input.
        //Each line is 14px
        if (stagingTag.height() <= 56) {
            $('.chat-input-scroll').css('height', stagingTag.height());
            $('.chat-input-scroll').nanoScroller({ stop: true });
        } else if (stagingTag.height() > 56) {
            $('.chat-input-scroll').css('height', '56px');
            $('.chat-input-scroll').nanoScroller({
                preventPageScrolling: true,
                flash: false
            });
        }

        chatInput.height(stagingTag.height());

        //Handle showing/hiding the character counter
        //On third line, show character counter
        if (stagingTag.height() >= 42) {
            var currentCharacterCount = $('.chat-input').val().length;
            var characterDifference = maxCharacterCount - currentCharacterCount;
            $('.text-counter').show();
            if (characterDifference < 0) {
                $('.text-counter').addClass('zero');
                $('.chat-send').addClass('disabled');
            } else {
                $('.text-counter').removeClass('zero');
                $('.chat-send').removeClass('disabled');
            }
            $('.text-counter').text(characterDifference);
        } else {
            $('.text-counter').hide();
        }
    },
    focusOnTextarea: function() {
        $('.chat-input', this.el).focus();
    },
    getSelectionHtml: function() {
        var html = "";
        if (typeof window.getSelection != "undefined") {
            var sel = window.getSelection();
            if (sel.rangeCount) {
                var container = document.createElement("div");
                for (var i = 0, len = sel.rangeCount; i < len; ++i) {
                    container.appendChild(sel.getRangeAt(i).cloneContents());
                }
                html = container.innerHTML;
            }
        } else if (typeof document.selection != "undefined") {
            if (document.selection.type == "Text") {
                html = document.selection.createRange().htmlText;
            }
        }
        alert(html);
    },
    placeCaretAtEnd: function(el) {
        el.focus();
        if (typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } else if (typeof document.body.createTextRange != "undefined") {
            var textRange = document.body.createTextRange();
            textRange.moveToElementText(el);
            textRange.collapse(false);
            textRange.select();
        }
    },
    moveActiveArrow: function(left) {
        var activeArrow = $(".active-arrow");
        if (activeArrow.position().left !== left) {
            activeArrow.stop().animate({
                left: parseInt(left, 10)
            }, 250);
        }
    },
    openAtReplies: function(e) {
        var self = this;
        e.preventDefault();
        var trayScrollableDiv = $('.tray-at-replies');
        $('.tray-scrollable').hide();

        var conversationId = this.parent.conversation.get('conversation_id');
        $('.tray-at-replies div.content').empty();

        Keek.api('/message/conversation', { conversation_id: conversationId }, function(data) {
            var currentUserId = self.parent.currentUserId;
            $.each(data.conversation.users, function() {
                if (this.user_id !== currentUserId) {
                    var user = new UserModel(this);
                    var userView = new App.Views.TrayUserItemView({model: user, type: 'at', parent: self});
                    $('.tray-at-replies div.content').append(userView.render().el);
                }
            });
            $('.tray-at-replies').nanoScroller();
        });

        this.moveActiveArrow(56);
        trayScrollableDiv.show();
    },

    openEmoticons: function(e) {
        e.preventDefault();
        var trayScrollableDiv = $('.tray-emoticons');
        $('.tray-scrollable').hide();
        this.moveActiveArrow(16);
        trayScrollableDiv.show();
    },
    selectEmoticon: function(e) {
        e.preventDefault();
        el = $(e.target).parent('a');
        var emoticon = el.data('emoticon');
        if (typeof emoticon !== 'undefined') {
            var chatInput = this.chatInput;
            chatInput.val(chatInput.val() + emoticon);

            var content = chatInput[0];//returns a HTML DOM Object, $('.chat-input', this.el) returns a jQuery object
            this.placeCaretAtEnd(content);
            this.toggleSendButtonState(content);
            this.handleTextInputAutogrow();
            $('.chat-input-scroll', this.el).nanoScroller({ scroll: 'bottom' });
        }
    },
    appendFriend: function(friend) {
        var friendItemView = new App.Views.NewMessageUserItemView({
            model: friend,
            parent: this
        });

        $('#new-message-users .content-inside', this.el).append(friendItemView.render().el);
    },
    toggleTray: function(e) {
        e.preventDefault();
        var self = this;
        var trayHeight = $('.messenger-other-actions-tray', self.el).height();
        var trayBtn = $('.open-tray', self.el);

        if ($('.icon-state', self.$el).hasClass('icon-messenger-open')) {
            $('.icon-state', self.$el).removeClass('icon-messenger-open');
            $('.icon-state', self.$el).addClass('icon-messenger-close');
        } else{
            $('.icon-state', self.$el).removeClass('icon-messenger-close');
            $('.icon-state', self.$el).addClass('icon-messenger-open');
        }

        if (trayBtn.hasClass('open')) {
            $('.messenger-other-actions-tray', self.$el).stop().hide(150);
            $('#new-message-users').removeClass('short');
            $('.messenger-input-window', self.$el).removeClass('tray-opened');
            $(".nano").nanoScroller();
            trayBtn.removeClass('open');
        } else {
            $('#new-message-users').addClass('short');
            $('.messenger-input-window', self.$el).addClass('tray-opened');
            trayBtn.addClass('open');
            $('.nano').nanoScroller();
            $('.messenger-other-actions-tray', self.$el).stop().toggle('blind', 150);
            $('a.tray-tab.emoticons-tab', self.$el).click();
        }
    },
    resetTray: function(){
        var trayBtn = $('.open-tray');
        if ($('.icon-state').hasClass('icon-messenger-close')) {
            $('.icon-state').removeClass('icon-messenger-close');
            $('.icon-state').addClass('icon-messenger-open');
        }
        if (trayBtn.hasClass('open')) {
            $('.messenger-other-actions-tray', this.$el).stop().hide(150);
            $('#messenger-chat-window').removeClass('short');
            $('.messenger-input-window').removeClass('tray-opened');
            $(".nano").nanoScroller({ scroll: 'bottom' });
            trayBtn.removeClass('open');
        }
    },
    submitMessage: function(e, isVideoMsg) {
        if (e) e.preventDefault();
        var self = this;
        var textStaging = $('#text_stage');
        var chatInput = this.chatInput;
        var caption = chatInput.val().replace(/\s*$/,"").replace(/\+/g,"%2b");
        var addMessageOptions = {}, callback;

        if ((caption !== '' && !$('.chat-send', this.$el).hasClass('disabled') && !this.messageSubmissionLocked) || isVideoMsg) {
            var selectedParticipants = [];

            this.messageSubmissionLocked = true;

            this.resetTray();

            $.each(this.selectedUsers, function() {
                selectedParticipants.push(this.get('user_id'));
            });
            chatInput.empty();

            if (this.recordedKeek && this.recordedKeek.id) {
                addMessageOptions.file_id = this.recordedKeek.id;
                addMessageOptions.duration = this.recordedKeek.duration;
                addMessageOptions.video_type = "video/x-flv";
                addMessageOptions.orientation = 0;
                addMessageOptions.image = this.recordedKeek.image;
            }

            addMessageOptions.caption = caption;
            addMessageOptions.users = selectedParticipants.join(', ');

            Keek.onError = function(){
                self.messageSubmissionLocked = false;
            };

            callback = function(d) {
                Keek.onError = null;

                self.messageSubmissionLocked = false;

                if (d.status.code == 2100) {
                    var conversation_id = d.conversation.conversation_id;
                    var conversationListView = self.parent.views.conversationListView;
                    var existingConversation = _.find(conversationListView.collection.models, function(conversation) {
                        return conversation.get('conversation_id') === conversation_id;
                    });
                    var convoModel;

                    if (conversationListView.collection.length > 0) {
                        if (existingConversation) {
                            existingConversation.set(d.conversation);
                            existingConversation.set('message', d.message);
                        } else {
                            //Create a new list item in the conversationListView
                            convoModel = new ConversationModel(d.conversation);
                            convoModel.set('message', d.message);
                            conversationListView.collection.add(convoModel, {at: 0});
                            conversationListView.collection.sort();
                        }
                    }

                    self.parent.conversation.set(d.conversation);
                    self.parent.views.conversationView.conversation.set(d.conversation);

                    var messengerLandingView = self.parent.views.messengerLandingView;
                    if (messengerLandingView) {
                        var messengerLandingExistingConversation = _.find(messengerLandingView.collection.models, function(conversation) {
                            return conversation.get('conversation_id') === conversation_id;
                        });
                        var messengerLandingConvoModel;

                        if (messengerLandingView.collection.length > 0) {
                            if (messengerLandingExistingConversation) {
                                messengerLandingExistingConversation.set(d.conversation);
                                messengerLandingExistingConversation.set('message', d.message);
                                self.parent.views.conversationView.conversation = new ConversationModel();
                                self.parent.views.conversationView.conversation.set('conversation_id', conversation_id);
                            } else {
                                //Create a new list item in the messengerLandingView
                                messengerLandingConvoModel = new ConversationModel(d.conversation);
                                messengerLandingConvoModel.set('message', d.message);
                                self.parent.views.conversationView.conversation = messengerLandingConvoModel;
                                messengerLandingView.collection.add(messengerLandingConvoModel, {at: 0});
                                messengerLandingView.collection.sort();
                                messengerLandingView.render(true);
                            }
                        }
                    }

                    if (self.localStorageCheck()) {
                        localStorage.setItem('messenger.currentConversationId', conversation_id);
                    }

                    //Since we don't want to come back through this screen when we navigate back, we need to remove the entry for new message from the history stack
                    //In case the user came here through the profile screen, we don't need them to be able to navigate back through there. We need to reset this history
                    //to include only the conversationListView and conversationView. We can assume history element 0 is the conversationListView, and the conversationView will
                    //be added when navigateForward happens.

                    self.parent.currentHistoryIndex = 0;
                    self.parent.history = self.parent.history.slice(0,1);

                    self.openNewConversation();
                    self.handleTextInputAutogrow();
                    self.selectedUsers = [];
                    self.recordedKeek = {
                        file_id: null,
                        duration: null,
                        image: null
                    };
                } else {
                    self.parent.modal.alert(d.status.message);
                }
            };

            Keek.api('/message/add_message', 'post', addMessageOptions, callback);
        }
    },

    showActionTrayButton: function(event){
        if ($(event.target).is('.chat-input', this.$el) && $('.open-tray', this.$el)) {
            $('.chat-input-outside', this.$el).addClass('focused');
            $('a.record-private', this.$el).addClass('shifted');
            $('.open-tray', this.$el).show();
        }
    },
    openNewConversation: function() {
        this.resetView();
        this.parent.navigateForward({
            target: this.parent.views.conversationView,
            referrer: this
        });
    },
    resetView: function (){
        this.clearChatInput();
    },
    displayInfoBox: function(){
        if ($("#new-message-input", this.$el).val() === '') {
            $('.messenger-input-window', this.$el).hide();
            $('.new-message-info', this.$el).fadeIn();
        }
        else if ($('.new-message-info', this.$el).is(":visible")) {
            $('.new-message-info', this.$el).hide();
            $('.messenger-input-window', this.$el).fadeIn();
        }
    },
    toggleSendButtonState: function(inputElem) {
        if ($(inputElem).val() !== '' && $(inputElem).val().match(/^\s*$/) === null) {
            $('.chat-send', this.$el).removeClass('disabled');
        } else {
            $('.chat-send', this.$el).addClass('disabled');
        }
    },
    clearChatInput: function() {
        this.chatInput.val('');
    },
    filterUsers: function(filterTerm) {
        var self = this;
        var prevFilterTerm = this.prevFilterTerm, requestOpts;

        if (filterTerm.length > 18)
            return false;

        if (this.allowFiltering === false && (filterTerm.indexOf(prevFilterTerm) < 0 || filterTerm.length < prevFilterTerm || prevFilterTerm.length === 0)) {
            this.allowFiltering = true;
        }

        if (this.allowFiltering) {
            requestOpts = {
                term: filterTerm.replace(/(<.*?>)/ig,""), //Parse out HTML tags
                include_user_status: 1
            };

            Keek.api('/message/contactlist_search', requestOpts, function(data) {
                $('#new-message-users .content-inside', this.$el).empty();
                
                if (data.status.code == 2000) {
                    if (data.users.length > 0) {
                        newMessageSearch.cacheUsers(data.users);
                        self.handleTagInput();
                    } else {
                        self.allowFiltering = false;
                        self.setSearchButtonState(filterTerm.replace(/(<.*?>)/ig,""));
                    }
                    
                    self.prevFilterTerm = filterTerm;

                    $('#new-message-users').nanoScroller({
                        preventPageScrolling: true
                    });
                }
            });
        } else {
            self.setSearchButtonState(filterTerm.replace(/(<.*?>)/ig,""));
        }
    },
    
    setSearchButtonState: function(searchTerm) {
        var stubUser = new UserModel({
            username: searchTerm,
            type: 'searchButton'
        });

        var searchButtonItem = new App.Views.NewMessageUserItemView({
            template: _.template($('#tmpl-search-button').html()),
            parent: this,
            model: stubUser
        });

        searchButtonItem.template = _.template($('#tmpl-search-button').html());
        $('#new-message-users .content-inside', this.$el).empty().append(searchButtonItem.render().el);
    },
    
    searchUsers: function() {
        var self = this;
        var prevFilterTerm = this.prevFilterTerm, requestOpts;
        var searchTerm = $('#new-message-input_tag').val();

        requestOpts = {
            term: searchTerm.replace(/(<.*?>)/ig,""), //Parse out HTML tags
            include_user_status: 1
        };

        Keek.api('/message/user_search', requestOpts, function(data) {
            if (data.status.code == 2000) {
                if (data.users.length > 0) {
                    var users = [];
                    $.each(data.users, function() {
                        var user = new UserModel(this);
                        if (user.get('user_id') !== self.parent.currentUserId) {
                            users.push(user);
                        }
                    });

                    $('#new-message-users .content-inside', this.$el).empty();
                    var newMessageTo = $('#new-message-input').val();
                    _(users).each(function(user){ // in case collection is not empty
                        if(newMessageTo.indexOf(user.attributes.username) === -1) {
                            self.appendFriend(user);
                        }
                    }, this);

                } else {
                    self.setNoContentState();
                }

                if (data.paging) {
                    if (data.paging.next_page > 0) {
                        //Set the next filter page to be pulled down and show the Load More button
                        self.nextFilterPage = data.paging.next_page;
                        $('#new-message-load-more').show();
                        $('#new-message-load-more .loading').fadeOut();
                        $('#new-message-more-link').fadeIn();
                    } else {
                        //No pages remaining, hide the Load More button and reset the nextFilterPage
                        self.nextFilterPage = 0;
                        $('#new-message-load-more .loading').hide();
                        $('#new-message-more-link').show();
                        $('#new-message-load-more').fadeOut();
                        $('.content-inside .list-user:last-child', self.el).addClass('last');
                    }
                }

                $('#new-message-users').nanoScroller({
                    preventPageScrolling: true
                });
            }
        });
    },
    resetFilterState: function() {
        var self = this;
        if (this.showLoadMoreOnReset) {
            $('#new-message-load-more').show();
        }

        this.prevFilterTerm = '';

        $('#new-message-users .content-inside', this.$el).empty();
        var newMessageTo = $('#new-message-input').val();
        _(this.collection.models).each(function(friend){ // in case collection is not empty
            if(newMessageTo.indexOf(friend.attributes.username) === -1){
                self.appendFriend(friend);
            }
        }, this);

        $('#new-message-users').nanoScroller({
            preventPageScrolling: true
        });
    },
    setNoContentState: function(hideMsg) {
        var noUserMsg = $('.filter-no-content').first().clone();
        $('#new-message-load-more').hide();
        
        if (!hideMsg) {
            noUserMsg.appendTo($('#new-message-users .content-inside', this.$el)).show();
        }
        $('#new-message-users').nanoScroller({
            preventPageScrolling: true
        });
    },
    addUserFromExternal: function() {
        var usermodel = this.selectedUserFromExternal;        

        //Add user to selectedUsers
        this.selectedUsers.push(usermodel);
        
        newMessageSearch.users[usermodel.get('user_id')] = {
            user_id: usermodel.get('user_id'),
            username: usermodel.get('username')
        };
        newMessageSearch.insertTag(usermodel.get('user_id'));
        
        $('.conversation-bottom-content', this.el).slideToggle(100);
        $('.chat-input', this.el).focus();
        this.selectedUserFromExternal = null;
    },
    handleTrayMouseup: function(e) {
        var self = this;
        var tray_bottom_val = parseInt($('.conversation-bottom-content', this.el).css('bottom'), 10);
        var bottom_content_container, container;

        container = $('#messenger-new-message');
        bottom_content_container = $(".conversation-bottom-content", container);

        if (bottom_content_container.has(e.target).length === 0 && $('.icon-state', container).hasClass('icon-messenger-open') && $('.chat-input', container).val().length === 0)
        {
            $('.chat-input-outside', container).removeClass('focused');
            $('a.record-private', container).removeClass('shifted');
        }
        else if (bottom_content_container.has(e.target).length === 0 && $('.icon-state', container).hasClass('icon-messenger-close') && $('#messenger-new-message .content-inside').has(e.target).length === 0)
        {
            $('.chat-input-outside', container).removeClass('focused');
            $('a.record-private', container).removeClass('shifted');
            this.toggleTray(e);
        }
    },

    handleRecorderOutput: function(file_id, duration) {
        this.recordedKeek = {
            id: file_id,
            duration: duration
        };

        this.submitMessage(null, true);
    },

    hideRecorder: function(e) {
        if (e) e.preventDefault();
        $('#messenger-keek-recorder-nm').fadeOut(250);
        swfobject.removeSWF('main-recorder-nm');
    },

    openRecorder: function(e) {
        e.preventDefault();
        var opts = {};
        $('#messenger-keek-recorder-nm').fadeIn(250, function() {
            swfobject.removeSWF('main-recorder-nm');
            $('#messenger-keek-recorder-nm').append('<div class="keek-overlay-inside" id="keek-recorder-inside-nm"></div>');

            var params = {
                allowscriptaccess: 'always',
                allownetworking: 'all',
                wmode: 'transparent',
                allowFullScreen: 'true'
            };

            var attributes = {
                id: "main-recorder-nm",
                name: "main-recorder-nm"
            };

            swfobject.embedSWF("/swf/Webcam_Messenger_v2.swf", "keek-recorder-inside-nm", "276", "346", "10.0.0", '', opts, params, attributes);
        });
    }
});

App.Views.NewMessageUserItemView = Backbone.View.extend({
    tagName: 'div',
    attributes: {
        'class': 'list-user right-content-user new-message-user'
    },
    template: _.template($('#tmpl-new-message-user-item').html()),
    initialize: function() {
        this.parent = this.options.parent;
    },
    render: function() {
        this.$el.html(this.template(this.model.toJSON()));
        this.$el.prop('id', 'nm-' + this.model.get('username'));
        this.$el.attr('data-username', 'nm-user-' + this.model.get('user_id'));        
        return this;
    },
    events: {
        'click': 'selectUser'
    },
    selectUser: function(e) {
        e.preventDefault();
        var self = this;

        $('.online-status-wrap', this.el).fadeOut('fast', function() {
            $('.loading', self.el).show();
        });

        if (this.model.get('type') && this.model.get('type') === 'searchButton') {
            newMessageSearch.doSearch($(newMessageSearch.config.input).val());
        } else {
            //Check to see if the user is allowing messages
            Keek.api('/message/can_send_message_to', { user_id: this.model.get('user_id') }, function(data) {
                if (data.status.code !== 2000) {
                    self.openAuthErrorModal(data.status.message);
                    $('.loading', self.el).delay(1000).fadeOut('fast', function(){
                        $('.online-status-wrap', self.el).fadeIn('fast');
                    });
                } else {
                    //Push the selected user to the selectedUsers collection. The rest of the processing for this event
                    //occurs in the onAddTag callback in the declaration for the XOXCO tagsinput plugin ($(elem).tagsInput)
                    self.$el.fadeOut(125);
                    // Added the current user to the friend collection
                    self.parent.selectedUsers.push(self.model);
                    
                    // Add the tag
                    newMessageSearch.insertTag(self.model.get('user_id'));
                    
                    $('.online-status-wrap', self.el).show();
                    $('.loading', self.el).hide();
                    
                    $('#new-message-users .content-inside').empty();
                    $('#new-message-load-more').hide();
                    $('#new-message-users').nanoScroller({
                        preventPageScrolling: true
                    });
                    
                    if (!$('.conversation-bottom-content', self.parent.$el).is(':visible')) {
                        $('#new-message-users').removeClass('extended');
                        $('.conversation-bottom-content', self.parent.$el).slideToggle(100);
                    }
                }
            });
        }
        
    },
    openAuthErrorModal: function(msg) {
        this.parent.parent.modal.alert(msg);
    }
});

//*** Conversation view
//*******************************************
var MessagesCollection = Backbone.Collection.extend({
    model: MessageModel,
    comparator: function(message) {
        var created = message.get('created');
        return created; //Sorts ascending
    },
    /**
     * Method to update the producer
     *
     * @param obj user
     * @returns void
     */
    updateUser: function(user) {
        this.filter(function(message) {
            if (message.get('producer').user_id === user.user_id) {
                message.set('producer', user);
                
                return message;
            }
        });
    }
});

App.Views.Conversation = App.Views.Messenger.extend({
    el: $('#messenger-conversation'),
    tagName: "div",
    viewName: 'conversationView',
    collection: new MessagesCollection(),
    conversation: new ConversationModel(),
    loadMoreCache: new MessagesCollection(),
    defaultTransition: 'left',
    title: '',
    active: false,
    prevMessageTime: null,
    headerNavigationType: 'messages',
    defaultNavigationTarget: 'conversationListView',
    inMessageRequestState: false,
    inPendingAcceptanceState: false,
    scrollTop: null,
    isScrolling: false,
    typingStatus: false,
    typingOnLastPull: false,
    enterPressed: false,
    recordedKeek: {
        file_id: null,
        duration: null,
        image: null
    },
    recordedKeekError: {
        file_id: null,
        duration: null,
        image: null
    },
    chatInput: null,
    chatArea: null,
    storedTrackingIds: [],
    lastPoll: false,
    //cachedTitle: '',
    messageHtmlCache: '',
    events: {
        'click #add-friend' : 'openAddFriend',
        'click .chat-send' : 'submitMessage',
        'click #conversation-leave' : 'showLeaveConversationOverlay',
        'click #conversation-clear' : 'clearConversation',
        'click .at-replies-tab' : 'openAtReplies',
        'click .emoticons-tab' : 'openEmoticons',
        'click #conversation-settings' : 'toggleConversationSettings',
        'click #user-count': 'openParticipantList',
        'click a.tray-emoticon-link': 'selectEmoticon',
        'click .open-tray' : 'toggleTray',
        'keydown .chat-input' : 'showActionTrayButton',
        'focus .chat-input' : 'showActionTrayButton',
        'click a#disable-audio': 'disableAudio',
        'click a#enable-audio': 'enableAudio',
        'click #messenger-overlay-done': 'hidePlayerOverlay',
        'click #messenger-recorder-cancel': 'hideRecorder',
        'click .chat-input-outside': 'focusOnTextarea',
        'click #conversation-load-more': 'loadMoreMessages',
        'click #conversation-record-private': 'openRecorder'
    },

    initialize: function() {
        this.parent = this.options.parent;
        this.chatInput = $('.chat-input', this.$el);
        this.chatArea = $('#messenger-chat-window div.content-inside', this.$el);
        _.bindAll(this, "handleTrayMouseup", "add", "remove");

        this._MessageViews = {}; // view cache for further reuse
        this.listenTo(this.collection, 'add', this.add);
        this.listenTo(this.collection, 'remove', this.remove);
        this.listenTo(this.collection, 'reset', this.reset);

        if (this.localStorageCheck()) {
            this.scrollTop = parseInt(localStorage.getItem('messenger.conversationView.scrollTop'), 10);
        }
    },

    resetUI: function() {
        this.typingStatus = false;
        
        $('#user-count', this.$el).hide();
        $('#messenger-chat-window .content-inside').empty();

        if ($('#messenger-settings-tray').hasClass('opened')) {
            $('#messenger-settings-tray').removeClass('opened');
        }

        this.chatInput.empty().val('');

        this.handleTextInputAutogrow();
        $('.chat-send').addClass('disabled');

        $('#messenger-keek-overlay').hide();
        swfobject.removeSWF('main-messenger');
        swfobject.removeSWF('main-recorder');

        $('#conversation-load-more').hide();

        $('#messenger-keek-recorder').hide();
        
        this.messageHtmlCache = '';
    },
    
    fetch: function() {
        var self = this,
            fetched = {}, // jQuery deferred object
            options = {
                number: 20,
                mark_conversation_read: 1
            },
            current_history_idx = localStorage.getItem('messenger.history.index') || 0;
            error = null,
            conversation_id = this.conversation.get('conversation_id') || null;
        
        // Initialize
        this.resetUI(); //Need to call this again for situations where the thread is reloaded, like accepting a message request
        this.inFetch                  = true;
        this.lastPoll                 = false;
        this.inMessageRequestState    = false;
        this.inPendingAcceptanceState = false;
        
        //If it already exists, clear the messenger poll
        clearInterval(this.updateMessengerPoll);
        clearInterval(self.parent.views.conversationListView.polling);
        
        // If the page is reloaded, get the conversation by id
        if (conversation_id === null) {
            fetched = Keek.api('/message/conversation', { conversation_id: localStorage.getItem('messenger.currentConversationId') }, function(data) {
                if (data.status.code === 2000) {
                    self.conversation = new ConversationModel(data.conversation);
                } else {
                    error = data.status.message;
                }
            });
            
            fetched.done(function() {
                if (!error) {
                    // Get all the messages
                    self.getMessages($.extend(options, {conversation_id: self.conversation.get('conversation_id')}));
                } else {
                    // Display the error modal and redirect to the messages list
                    self.parent.modal.alert(error);
                    self.navigateBack({
                        target: self.parent.views.conversationListView,
                        referrer: self
                    });
                }
            });
        } else {
            try {
                self.getMessages($.extend(options, {conversation_id: self.conversation.get('conversation_id')}));
            } catch(e) {
                self.parent.modal.alert(e.message);
                self.navigateBack({
                    target: self.parent.views.conversationListView,
                    referrer: self
                });
            }
        }
    },
    
    getMessages: function(options) {
        var self = this;
        var messages = [], users = [];
        var i = 0;
        var usernameString = '';
        var messageCollection = [];
        var pendingAcceptance = false;
        var unreadMsgCount = 0;
        
        Keek.api('/message/message_list', options, function(data) {
            if (data.status.code !== 2000) {
                throw new Exception(data.status.message);
            } else {
                self.parent.conversation.set(data.conversation);
                self.parent.conversation.set('users_pending_acceptance', data.users_pending_acceptance);
                self.parent.conversation.set('requires_user_acceptance_for', data.requires_user_acceptance_for);

                self.users_pending_acceptance = [];

                if (data.requires_user_acceptance_for) {
                    //If there's no messages, the conversation should have a pending message request
                    var msg = new MessageModel();
                    var requiresAcceptanceForUser = data.requires_user_acceptance_for.user;
                    var current_users = data.users;

                    var requiresAcceptanceForUserIsInConversation = _.find(current_users, function(user) { 
                        return user.user_id === requiresAcceptanceForUser.user_id;
                    });

                    msg.set({
                        'producer': requiresAcceptanceForUser,
                        'conversation_id': self.conversation.get('conversation_id'),
                        'type': 'request',
                        'conversation_type': data.users.length > 2 ? 'group' : 'individual'
                    });

                    if (data.requires_user_acceptance_for.user.is_blocking === 1) {
                        msg.set('state', 'blocked');
                    } else {
                        msg.set('state', '');
                    }

                    messageCollection.push(msg);

                    self.inMessageRequestState = true;

                    //In a group chat, show the "Also invited" box
                    if (data.users.length > 2) {
                        var alsoInvitedBox = new MessageModel();

                        var users = _.filter(data.users, function(user) {
                            return user.user_id !== self.parent.currentUserId && user.user_id !== data.requires_user_acceptance_for.user.user_id;
                        });

                        alsoInvitedBox.set({
                            'type': 'also-invited',
                            'users': users
                        });
                        messageCollection.push(alsoInvitedBox);
                    }
                } else {
                    if (data.users_pending_acceptance.length > 0 && data.users_pending_acceptance.length === data.users.length - 1) {
                        $('#add-friend').hide();
                        //Display the box showing who has not accepted the request yet.
                        var acceptanceMsg = new MessageModel();
                        var usersPendingAcceptance = [];
                        _.each(data.users_pending_acceptance, function(userid) {
                            _.each(data.users, function(user) {
                                if (userid === user.user_id && user.user_id !== self.parent.currentUserId) {
                                    usersPendingAcceptance.push(user);
                                }
                            });
                        });

                        acceptanceMsg.set({
                            'type': 'acceptance-pending',
                            'acceptance_type': data.users_pending_acceptance.length > 1 ? 'group' : 'individual',
                            'timestamp': self.generateTimestamp(self.parent.conversation.get('last_updated'), { firstMessage: true }),
                            'acceptance_users': usersPendingAcceptance
                        });

                        messageCollection.push(acceptanceMsg);
                        pendingAcceptance = true;
                        self.users_pending_acceptance = data.users_pending_acceptance;
                        self.inPendingAcceptanceState = true;
                    }

                    //Messages come in from the API from latest to earliest, so we need to reverse them
                    for(i = 0; i< data.messages.length; i++) {
                        messages.push(data.messages[i]);
                    }
                    //TODO: Consider a different implementation of the reverse function
                    //http://stackoverflow.com/questions/5276953/what-is-the-most-efficient-way-to-reverse-an-array-in-javascript
                    messages.reverse();                    
                    
                    // WEB-3626
                    var historyUsers = self.getHistoryUserIDs(messages, data.users);
                    
                    for (i = 0; i < messages.length; i++) {
                        var message = new MessageModel();

                        if (i === 0) {
                            message.set({timestamp: self.generateTimestamp(messages[i].created, { firstMessage: true })});
                        } else {
                            message.set({ timestamp: self.generateTimestamp(messages[i].created) });
                        }

                        if (messages[i].producer.user_id == self.options.parent.currentUserId) {
                            if (historyUsers.length === 0) {
                                message.set({
                                    pendingAcceptance: pendingAcceptance ? true : false,
                                    notif_message: pendingAcceptance ? 'Pending approval' : ''
                                });
                            }
                            
                            message.set(messages[i]);
                            message.set({ history: 'true', type: 'outgoing' });
                        } else {
                            message.set(messages[i]);
                            message.set({ type: 'incoming' });
                        }

                        if (messages[i].details.video) {
                            //Grab expiry off of one of the asset URLs. This is ok here as both asset URLs should be up to date
                            var queryParams = messages[i].details.video.substring(messages[i].details.video.indexOf('?') + 1);
                            var QueryString = self.getQueryString(queryParams);
                            message.set('expiry', QueryString.exp * 1000); //Expiry comes back as seconds from the API

                            var details = message.get('details');
                            details.thumbnail = self.buildThumbnailUrl(details.thumbnail);
                            message.set('details', details);
                        }

                        if (i == messages.length - 1) {
                            if (self.localStorageCheck()) {
                                localStorage.setItem('messenger.currentConversationMessageId', messages[i].message_id);
                            }
                        }

                        messageCollection.push(message);
                        delete message;
                    }
                }
                
                $.each(data.unread_messages_count, function(index, val) {
                    unreadMsgCount = unreadMsgCount + parseInt(val, 10);
                });
                self.model.set({priv: unreadMsgCount});
                self.collection.reset();
                self.collection.add(messageCollection);
                self.collection.sort();

                // self.appendCachedMessages();
                // self.scrollToBottom();

                //If 20 messages are returned, then show the "load more" button for paging purposes
                var _conversation_load_more = $('#conversation-load-more');

                if (data.more_older_messages > 0) {
                    $('#conversation-more-link').show();
                    _conversation_load_more.show();
                } else {
                    _conversation_load_more.hide();
                }

                //Update the conversationListView view for this conversation
                var listViewModel = _.find(self.views.conversationListView.collection.models, function(model) {
                    return model.get('conversation_id') === self.conversation.get('conversation_id');
                });
                if (listViewModel) {
                    if (data.messages[0]) {
                        listViewModel.set({
                            'message': data.messages[0],
                            requires_user_acceptance_for: null
                        });
                    }
                }

                if (self.parent.views.messengerLandingView) {
                    //Update the conversationListView view for this conversation
                    var landingViewModel = _.find(self.views.messengerLandingView.collection.models, function(model) {
                        return model.get('conversation_id') === self.conversation.get('conversation_id');
                    });
                    if (landingViewModel) {
                        if (data.messages[0]) {
                            landingViewModel.set({
                                'message': data.messages[0],
                                requires_user_acceptance_for: null
                            });
                        }
                    }
                }
                
                // Set the title and update the user count
                self.resetTitle();
                self.updateUserCount();
                self.render();
                
                // Fix the 'show more' link pushes the messages list down
                if (_conversation_load_more.is(':visible')) {
                    $(".nano").nanoScroller({ scroll: 'bottom' });
                }
            }
        });
    },
    
    // WEB-3626
    /**
     * Get all the users
     * 
     * @param array messages
     * @param array current_users
     * @return array user_ids
     */
    getHistoryUserIDs: function(messages, current_users) {
        var user_ids = [];
    
        $.each(messages, function() {
            if (this instanceof MessageModel) {
                var _producer = this.get('producer'),
                    _other_user = this.get('details').user;
            } else {
                var _producer = this.producer, // message's producer
                    _other_user = this.details.user; // system notification
            }
            
            if (_producer && _producer.user_id && user_ids.indexOf(_producer.user_id) < 0) {
                user_ids.push(_producer.user_id);
            }
            
            if (_other_user && _other_user.user_id && user_ids.indexOf(_other_user.user_id) < 0) {
                user_ids.push(_other_user.user_id);
            }
        });
        
        $.each(current_users, function() {
            if (user_ids.indexOf(this.user_id) >=0) {
                user_ids.splice(user_ids.indexOf(this.user_id), 1);
            }
        });
        
        return user_ids;
    },
    
    render: function() {
        var self = this;
        var trayHeight = $('.messenger-other-actions-tray').height();
        var trayBtn = $('.open-tray');
        var titleString;
        
        this.inFetch = false;
        
        if (this.parent.conversation.get('users').length <= 2) {
            $('.at-replies-tab').hide();
        } else {
            $('.at-replies-tab').show();
        }

        var timer = null;

        $('.content').on('scroll', function(){
            if (timer !== null) {
                self.isScrolling = true;
                clearTimeout(timer);
            }

            timer = setTimeout(function(){
                self.isScrolling = false;
            }, 2000);
        });

        if (this.inMessageRequestState){
            this.scrollToTop();
        }else{
            this.scrollToBottom();
        }

        if (trayBtn.hasClass('open')) {
            $('.conversation-bottom-content', this.el).css({bottom: '-' + trayHeight});
            $('#messenger-chat-window').removeClass('short');
            $(".nano").nanoScroller();
            $(".nano").nanoScroller({ scroll: 'bottom' });
            trayBtn.removeClass('open');
        }

        this.chatInput.off('activate').on('activate', function() {
            var range, sel;
            if ( (sel = document.selection) && document.body.createTextRange) {
                range = document.body.createTextRange();
                range.moveToElementText(this);
                range.select();
            }
        });

        this.chatInput.off('blur').blur(function(e){
            var sel;
            //Remove the range selection created on focus in order to properly remove focus from input.
            //Prevents an issue where clicking on the "Send" button while focusing on the input causes the cursor
            //to stay focused in the input.
            sel = window.getSelection();
            sel.removeAllRanges();
        });

        this.chatInput.off('keyup').keyup(function(e) {
            var text = $(this).val();
            var length = text.length;
            self.toggleSendButtonState(this);
            self.handleTextInputAutogrow(e);

            if (self.parent.ie <= 9 || self.parent.ie === undefined) {
                if (length > 0) {
                    self.typingStatus = true;
                    $(this).prop('dir', self.parent.bidi(text));
                } else {
                    self.typingStatus = false;
                    $(this).prop('dir', '');
                }
            }

            if (e.which === 13 && length > 0) {
                e.preventDefault();
                self.submitMessage(e);
            } else if (e.which === 13) {
                e.preventDefault();
            }

        });

        this.chatInput.off('cut paste').bind('cut paste', function(e) {
            self.toggleSendButtonState(this);
            self.handleTextInputAutogrow(e);
        });

        this.chatInput.off('keydown').keydown(function(e) {
            if (e.which === 13) {
                e.preventDefault();
            }
            self.handleTextInputAutogrow(e);
        });

        $('.content', this.$el).on('scroll', function() {
            self.recordScrollPosition();

            //Timer to set self.recentlyScrolled to false. If scroll event fires, the timer is cleared
            //and reset. Used to handle scrolling to the bottom of the conversation if a message has been
            //received

            self.recentlyScrolled = true;
            clearTimeout(self.scrollTimer);
            self.scrollTimer = setTimeout(function() {
                self.recentlyScrolled = false;
            }, 500);
        });

        $(document).off('mouseup', self.handleTrayMouseup)
            .mouseup(self.handleTrayMouseup);

        this.updateMessengerPoll = setInterval(function() {
            self.updateMessenger(self);
        }, self.updateInterval);

        //Hide Add Friend button if the other user hasn't accepted your message
        if (self.inMessageRequestState === true || self.inPendingAcceptanceState === true) {
            $('#add-friend').hide();
        }else{
            $('#add-friend').show();
        }
        
        this.changeTitle(self.getTitle());
        
        this.hideLoadingIndicator();

        return this;
    },
    
    getTitle: function() {
        return this.title || '';
    },
    
    resetTitle: function() {
        var self = this,
            title = '',
            separator = ', ';
        
        if (localStorage.getItem('messenger.minimized') === 'false') {
            $('#messenger-typing-title').hide();
            $('#messenger-title').show();
        }
        
        if (self.conversation !== null && self.getCurrentViewObject() === self) {
            if (self.conversation.get('users').length === 1) {
                self.title = 'Just you';
                $('#add-friend').hide();
            } else {                
                $.each(self.conversation.get('users'), function(idx, user) {                    
                    // Set the username
                    if (user.user_id !== self.parent.currentUserId) {
                        title += user.username;
                        title += separator;
                    }
                });
                
                if (title.length > 0) {
                    title = title.slice(0, -2);
                }
                
                self.title = title;
            }
        }
    },
    
    /**
     * Update the number of users in current conversation
     *
     * @returns void
     */
    updateUserCount: function() {
        var self = this,
            $userCount = $('#user-count', self.$el),
            numOfUser = self.conversation.get('users').length || 0;
        
        $userCount.text(numOfUser + '/' + self.max_conversation_users).show();
    },
    
    showActionTrayButton: function(event){
        if (this.parent.conversation.get('requires_user_acceptance_for') && this.parent.conversation.get('requires_user_acceptance_for').user.is_blocking === 1) {
            $('.chat-input', this.el).blur();
            $('#messenger-modal').fadeIn(250, function() {
                $('#messenger-request-state-unblock-overlay .unblock').show();
                $('#messenger-request-state-unblock-overlay').show();
            });
            return false;
        }
        
        // WEB-3626
        var historyUsers = this.getHistoryUserIDs(this.collection.models, this.parent.conversation.get('users'));
        
        if (this.inPendingAcceptanceState && historyUsers.length == 0) {
            $('.chat-input', this.el).blur();
            this.parent.modal.alert("You can't send messages while approval is pending");
        }

        if (this.inMessageRequestState) {
            $('.chat-input', this.el).blur();
            this.showMessageRequestErrorOverlay();
        }

        if ($(event.target).is('.chat-input') && $('.open-tray')) {
            $('.chat-input-outside', this.el).addClass('focused');
            $('a.record-private', this.el).addClass('shifted');
            $('.open-tray', this.el).show();
        }
    },
    
    //Handles the creation of a conversation message view when a message model is added to the collection
    add: function(m) {
        var conversationMessageView;
        var self = this;
        
        m.set({ rendered: true }, { silent: true });
        
        conversationMessageView = new App.Views.ConversationMessageView({
            model: m,
            parent: this
        });
        
        m.set('cid', conversationMessageView.cid);
        
        //Logic to handle the number of messages that are displayed in the thread at any given point. Since the message
        //has already been added to the collection at this point, we need to check that the collection's length is greater 
        //than our display threshold
        // if (this.collection.length > 250 && !this.inFetch) {
        //if (this.collection.length > 150 && !this.inFetch) {
            //Since we've hit 500 messages displaying in the thread, we need to do some cleanup
            //Destory the first message in the collection, causing its view to be destroyed
            //this.collection.remove(this.collection.at(0));

            //We need the user to be able to load the message we just removed if they want. Check to see if
            //the Load More link is visible, then display it if it is not. We shouldn't have to update the Load More
            //button's logic since it's all internalized in the load more button.
        //    if (!$('#conversation-load-more').is(':visible')) {
        //        $('#conversation-load-more').show();
        //    }
        //}
        
        this._MessageViews[conversationMessageView.cid] = conversationMessageView;
        
        // Update the message producer infomation
        this.collection.updateUser(m.get('producer'))
        
        this.collection.sort();

        //If this message was generated by the poll, we want to cache the HTML of the message and only append it once the 
        //poll has finished handling the messages and adding them to the collection. handleMessages() calls the appendCachedMessages()
        //function which does the actual appending. In any other cases, we can append the messages directly

        // if (m.get('isPollMsg')) {
            // this.messageHtmlCache += conversationMessageView.render().el.outerHTML;
        // } else {
            if (m.get('isLoadMoreMsg')) {
                $('#messenger-chat-window div.content-inside', this.el).prepend(conversationMessageView.render().el);
            } else {
                $('#messenger-chat-window div.content-inside', this.el).append(conversationMessageView.render().el);

                if(!self.isScrolling){
                    this.scrollToBottom();
                }

            }
        // }

        if (this.collection.last === m) {
            this.updateConversationListItems(m);
        }
    },

    remove: function(m) {
        this._MessageViews[m.get('cid')].close();
        delete this._MessageViews[m.get('cid')];
    },

    reset: function() {
        var self = this;

        _.each(this._MessageViews, function(messageView) {
            var cid = messageView.cid;
            messageView.close();
            delete self._MessageViews[cid];
        });
    },

    appendCachedMessages: function() {
        this.chatArea[0].innerHTML += this.messageHtmlCache;
        this.messageHtmlCache = '';
        this.scrollToBottom();
    },

    //Updates the individual conversation list item views for the Conversation List
    updateConversationListItems: function(message) {
        var conversationListView = this.parent.views.conversationListView;
        var messengerLandingView = this.parent.views.messengerLandingView;

        //Find the conversation list item for this conversation and update it with this message
        listViewConvoModel = _.find(conversationListView.collection.models, function(conversation) {
            return conversation.get('conversation_id') === self.conversation.get('conversation_id');
        });

        if (listViewConvoModel) {
            //Update the existing list view model. We need to use jQuery.extend to clone the message object in order
            //to avoid it being changed, as it's used later on to actually render the message.
            var newMsgObject = $.extend(true, {}, message.toJSON());
            listViewConvoModel.set('message', newMsgObject, {silent: true});
            listViewConvoModel.set('messages_pending', 0, {silent: true});
            conversationListView.render(true);
        }

        if (messengerLandingView){
            //Find the conversation list item for this conversation and update it with this message
            messengerLandingConvoModel = _.find(messengerLandingView.collection.models, function(conversation) {
                return conversation.get('conversation_id') === self.conversation.get('conversation_id');
            });

            if (messengerLandingConvoModel) {
                //Update the existing list view model. We need to use jQuery.extend to clone the message object in order
                //to avoid it being changed, as it's used later on to actually render the message.
                var newLandingMsgObject = $.extend(true, {}, message.toJSON());
                messengerLandingConvoModel.set('message', newLandingMsgObject, {silent: true});
                messengerLandingConvoModel.set('messages_pending', 0, {silent: true});
                messengerLandingView.render(true);
            }
        }
    },

    scrollToTop: function(opts) {
        $('#messenger-chat-window', this.el).nanoScroller();
        $('#messenger-chat-window', this.el).nanoScroller({
            preventPageScrolling: true,
            scroll: 'top'
        });
    },

    scrollToBottom: function(opts) {
        if (!opts) opts = {};

        if (!this.recentlyScrolled && opts.isPoll) {
            //Animate to bottom of message
            $('#messenger-chat-window').nanoScroller({ stop: 'true' });
            $('#messenger-chat-window .content').animate({
                scrollTop: $('#messenger-chat-window .content-inside').height()
             }, 250);
            $('#messenger-chat-window').nanoScroller({ preventPageScrolling: 'true' });
        } else {
            scrollerOpts = {
                preventPageScrolling: true
            };

            if (!self.inMessageRequestState) {
                if (self.scrollTop) {
                    scrollerOpts.scrollTop = self.scrollTop;
                } else {
                    scrollerOpts.scroll = 'bottom';
                }
            }

            $('#messenger-chat-window', this.el).nanoScroller();
            $('#messenger-chat-window', this.el).nanoScroller(scrollerOpts);
        }
    },

    generateTimestamp: function(messageTime, opts) {
        //Timestamps:
        //Loop through each message in the messages object. For the first message, display its timestamp. For every consecutive message,
        //check to see if the time is in the same range as the previous message (e.g. message is on same day as previous one). Each range should only
        //be displayed once (e.g. For two messages on August 21st, the date will appear above the first message but not the second). For messages sent
        //today, check to see if the message was sent within 30 minutes of the previous message.
        var formattedHours;

        function generateFormattedTime(hours, minutes) {
            if (hours > 12) {
                formattedHours = hours - 12;
            } else {
                formattedHours = hours;
            }

            if (minutes < 10) {
                minutes = '0' + minutes;
            }

            var am_pm = hours > 11 ? 'PM' : 'AM';
            return formattedHours + ':' + minutes + ' ' + am_pm;
        }

        if (typeof opts == 'undefined') {
            opts = {};
        }

        var prevTime = this.prevMessageTime;
        var messageDate = new Date(messageTime);
        var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        var now = new Date();
        var yesterday = new Date(now - (1000*60*60*24));
        var timestamp = '';
        var hours = null;

        if (opts.firstMessage) {
            //If opts.firstMessage is set, the supplied message is the first message displayed in the conversation. Always show the message's timestamp.
            if (messageDate.getMonth() == now.getMonth() && messageDate.getFullYear() == now.getFullYear()) {
                if (now.getDate() - messageDate.getDate() == 1) {
                    timestamp = 'Yesterday';
                } else if (now.getDate() - messageDate.getDate() === 0) {
                    timestamp = generateFormattedTime(messageDate.getHours(), messageDate.getMinutes());
                } else {
                    timestamp = monthNames[messageDate.getMonth()] + ' ' + messageDate.getDate() + ', '+ generateFormattedTime(messageDate.getHours(), messageDate.getMinutes());
                }
            } else {
                timestamp = monthNames[messageDate.getMonth()] + ' ' + messageDate.getDate()+ ', '+ generateFormattedTime(messageDate.getHours(), messageDate.getMinutes());
            }
        } else {
            var prevDate = new Date(prevTime);
            if (messageDate.toDateString() == now.toDateString()) {
                //if messageDate is today
                var deltaTime = messageTime - prevTime;
                if (deltaTime / (1000*60) >= 30) {
                    timestamp = generateFormattedTime(messageDate.getHours(), messageDate.getMinutes());
                }
            } else {
                //if toDateString of prevDate is the same as messageDate.toDateString() do not write timestamp
                if (prevDate.toDateString() !== messageDate.toDateString()) {
                    if (messageDate.toDateString() == yesterday.toDateString()) {
                        timestamp = 'Yesterday';
                    } else {
                        timestamp = monthNames[messageDate.getMonth()] + ' ' + messageDate.getDate() + ', '+ generateFormattedTime(messageDate.getHours(), messageDate.getMinutes());
                    }
                }
            }
        }

        //Set prevTime for the next iteration
        this.prevMessageTime = messageTime;

        return timestamp;
    },

    updateMessenger: function(self) {
        //Requires the messenger to pass itself into the function as "self", as "this" becomes
        //Window when the function is run from setInterval()

        //If in the conversation view, pull Keek.conversation for the current conversation. If there
        //are pending messages, pull Keek.message_list for that conversation and update the conversation

        var typingOnLastPull = self.typingOnLastPull, rerenderCollection = false,
            prevUsersPending = self.users_pending_acceptance, msgCountTally = 0, requestOpts;
        var storedMessageId = this.localStorageCheck() ? localStorage.getItem('messenger.currentConversationMessageId') : self.parent.conversation.get('message').message_id;
        var lastMessage = self.collection.at(self.collection.length - 1);
        var numCurrentConversationsInView = self.views.conversationListView.collection.length;
        var conversationList = self.parent.views.conversationListView;
        var messengerLandingView = self.parent.views.messengerLandingView ? self.parent.views.messengerLandingView : null;
        var since_id;
        var currentNumOfUsers = self.conversation.get('users').length;

        if (self.since_id) {
            since_id = self.since_id;
        } else {
            since_id = self.collection.last() ? self.collection.last().get('cursor_id') : '';
        }

        if (this.lastPoll) {
            this.typingStatus = false;
        }
        
        requestOpts = {
            conversation_id: self.conversation.get('conversation_id'),
            number: 20, //Number is an arbitrary large number to pull down. Someone (in theory) should not be able to enter this many messages in the interval that updateMessenger is run
            mark_conversation_read: this.lastPoll ? 0 : 1,
            send_prev_unread_messages: 40,
            since_id: since_id,
            typing: this.typingStatus ? true : '' //Typing status requires the presence of a value for true and no value for false
        };

        Keek.api('/message/message_list', requestOpts, function(data) {
            if (self.lastPoll) {                
                clearInterval(self.updateMessengerPoll);
                self.updateMessengerPoll = null;
                self.lastPoll = false;
            } else if (data.status.code === 2000) {
                if (prevUsersPending && prevUsersPending.length > 0) {
                    var currentUsersPending = data.users_pending_acceptance;                    
                    
                    //Compares the two lists
                    if (currentUsersPending.length < prevUsersPending.length) {
                        var deltaUserIds = [];
                        _.each(prevUsersPending, function(userid) {
                            if ($.inArray(userid, currentUsersPending) === -1) {
                                deltaUserIds.push(userid);
                            }
                        });
                        
                        var acceptedUser; //Flag we'll use to ensure the user that is no longer in the pending acceptance list is still in the conversation

                        _.each(deltaUserIds, function(id){
                            //Check the users list for each of the delta user ids. If the user is still in the conversation, set the flag to true
                            var exists = _.find(data.users, function(user) {
                                return id == user.user_id;
                            });
                            if (exists) {
                                acceptedUser = exists;
                                acceptedUser.is_pending_contact = 0;
                            }
                        });

                        var acceptanceDiv = $('.content-inside .acceptance-pending', self.el);                        

                        //There are two possibilities here: all users in the conversation were pending and have accepted, or all users that were pending
                        //in a mix of users who had and had not accepted have accepted. If the acceptanceDiv is showing, it's the former. We'll use that to
                        //perform the logic below.
                        if (acceptanceDiv.length > 0 && acceptedUser && acceptedUser.is_pending_contact === 0) {
                            $('.pre-accept', acceptanceDiv).hide();
                            $('.post-accept a.username-to-profile', acceptanceDiv).text(acceptedUser.username).prop('id', 'acc-post-' + acceptedUser.user_id);
                            $('.post-accept', acceptanceDiv).show();
                            acceptanceDiv.delay('1000').fadeOut(500, function(){
                                $('.conversation-message').removeClass('pending-acceptance');
                                $('#messenger-chat-window').nanoScroller({ scroll: 'bottom' });

                                var acceptanceMsg = self.collection.at(0);
                                self.collection.remove(acceptanceMsg);

                                //Now that the initial message has been destroyed, the first actual message in the conversation is sitting at index 0 in the collection
                                self.collection.each(function(model){ model.set('pendingAcceptance', false);});
                                $('.notif-message').text('');
                                var firstMsgId = self.collection.at(self.collection.length - 1).get('message_id');

                                $('#' + firstMsgId).find('.notif-message').text('Delivered');
                                $('#add-friend').css('display', 'block');
                            });
                            self.inMessageRequestState = false;
                            self.inPendingAcceptanceState = false;
                        }
                    }
                }

                self.users_pending_acceptance = data.users_pending_acceptance;

                if (self.inMessageRequestState) {
                    //Grab requires_user_acceptance_for user
                    var current_users = data.users;
                    //Search for requires_user_acceptance_for user in list of current users
                    var requiresAcceptanceForUser = data.requires_user_acceptance_for.user;
                    var requiresAcceptanceForUserIsInConversation = _.find(current_users, function(user) { 
                        return user.user_id === requiresAcceptanceForUser.user_id;
                    });
                    var msg = self.collection.at(0);

                    if (data.requires_user_acceptance_for.user.is_blocking === 1) {
                        msg.set('state', 'blocked');
                    }

                    //In a group chat, update the "Also invited" box
                    if (data.users.length > 2) {
                        var invitedCollection = self.collection.at(1);
                        var users = _.filter(data.users, function(user) {
                            return user.user_id !== self.parent.currentUserId && user.user_id !== data.requires_user_acceptance_for.user.user_id;
                        });

                        invitedCollection.set('users', users);
                    }
                }

                if (data.messages.length > 0) {
                    self.handleMessages(data.messages);
                }

                if (data.prev_unread_messages.length && data.prev_unread_messages.length > 0) {
                    self.handleMessages(data.prev_unread_messages, { isPrevUnread: true });

                    //We need to integrate the new messages into the conversation. Hoooo boy. Here we go.
                    //For every message stored in the collection, we're going to find its view stored in this._MessageViews
                    //Once we do, we'll put a reference to it into an array. Finally, we'll iterate through that array
                    //and re-append the collection to the screen. This is a bit expensive.
                    //TODO: Figure out a less expensive way of handling prev_unread_messages, possibly by only sorting messages that have not yet been sorted.

                    var messageArea = $('#messenger-chat-window div.content-inside', self.el);
                    var copiedCollection = $.extend(true, [], self.collection.models);

                    for(var i=0; i < self.collection.length; i++){
                        copiedCollection[i] = self._MessageViews[self.collection.models[i].get('cid')].$el;
                    }

                    for(var i=0; i < copiedCollection.length; i++) {
                        messageArea.append(copiedCollection[i]);
                        delete copiedCollection[i];
                    }
                }

                if (self.playSound) {
                    //self.playSound is set in handleMessages. We previously had the sound playing in handleMessages, but since we can call that function
                    //twice, we could potentially play the sound twice. Instead, we're setting a flag on the conversation view, then resetting that flag
                    //once we're done
                    self.parent.playNotificationSound();
                    self.playSound = false;
                }

                if (data.messages.length > 0) {
                    self.since_id = self.collection.last().get('cursor_id');
                }
                self.storedTrackingIds = [];

                //Put list of users into stored conversation object
                self.conversation.set({
                    users: data.users,
                    requires_user_acceptance_for: data.requires_user_acceptance_for
                });

                self.parent.conversation.set({
                    users: data.users,
                    requires_user_acceptance_for: data.requires_user_acceptance_for
                });

                if (messengerLandingView) {
                    landingListItem = _.find(messengerLandingView.collection.models, function(convo) {
                        return convo.get('conversation_id') === data.conversation.conversation_id;
                    });
                    landingListItem.set({
                        users: data.users,
                        requires_user_acceptance_for: data.requires_user_acceptance_for
                    });
                }

                $('#user-count').text(data.users.length + '/' + self.max_conversation_users);

                self.checkConversationTypingStatuses(data.users, self.conversation.get('conversation_id'));

                if (data.messages.length > 0) {
                    //Update the conversation list and messenger landing list with the last message in the thread
                    var conversationListItem = _.find(conversationList.collection.models, function(convo) {
                        return convo.get('conversation_id') === data.conversation.conversation_id;
                    });

                    if (conversationListItem) {
                        conversationListItem.set({
                            'message': data.messages[data.messages.length - 1],
                            'last_updated': parseInt(data.messages[data.messages.length - 1].cursor_id, 10)
                        });
                    }

                    if (messengerLandingView) {
                        if (landingListItem) {
                            landingListItem.set({
                                'message': data.messages[data.messages.length - 1],
                                'last_updated': parseInt(data.messages[data.messages.length - 1].cursor_id, 10)
                            });
                        }
                    }
                }

                _.each(data.unread_messages_count, function(msgCount, conversationId, index) {
                    //Since the number of conversations here is equal to the number of conversations in a single "page" on the conversation list view
                    //and landing view, we don't have to worry about paging getting messed up there.

                    if (msgCount > 0 && numCurrentConversationsInView !== 0) {
                        //TODO: When proper garbage collection is implemented, we'll need to cache the messages in conversationListView

                        //Find the model in the conversationListView that corresponds to this conversation_id
                        var listViewModel = _.find(self.views.conversationListView.collection.models, function(model) {
                            return model.get('conversation_id') === conversationId;
                        });

                        //Compare the number of pending messages. If the new number is greater, use Keek.conversation()
                        //to update the model
                        if (listViewModel && msgCount > listViewModel.get('messages_pending')) {
                            Keek.api('/message/conversation', { conversation_id: conversationId }, function(data) {
                                listViewModel.set(data.conversation);
                                self.views.conversationListView.collection.sort();
                                self.views.conversationListView.render(true);
                            });
                        } else if (!listViewModel) {
                            Keek.api('/message/conversation', { conversation_id: conversationId }, function(data) {
                                listViewModel = new ConversationModel(data.conversation);
                                self.views.conversationListView.collection.add(listViewModel);
                                self.views.conversationListView.collection.sort();
                                self.views.conversationListView.render(true);
                            });
                        }
                    }

                    if (msgCount > 0){
                        var messengerLandingView = self.parent.views.messengerLandingView;
                        if (messengerLandingView){
                            //Find the model in the messenger landing that corresponds to this conversation_id
                            var messengerLandingViewModel = _.find(messengerLandingView.collection.models, function(model) {
                                return model.get('conversation_id') === conversationId;
                            });

                            //Compare the number of pending messages. If the new number is greater, use Keek.conversation()
                            //to update the model
                            if (messengerLandingViewModel && msgCount > messengerLandingViewModel.get('messages_pending')) {
                                Keek.api('/message/conversation', { conversation_id: conversationId }, function(data) {
                                    messengerLandingViewModel.set(data.conversation);
                                    messengerLandingView.collection.sort();
                                    messengerLandingView.render(true);
                                });
                            } else if (!messengerLandingViewModel) {
                                Keek.api('/message/conversation', { conversation_id: conversationId }, function(data) {
                                    messengerLandingViewModel = new ConversationModel(data.conversation);
                                    messengerLandingView.collection.add(messengerLandingViewModel);
                                    messengerLandingView.collection.sort();
                                    messengerLandingView.render(true);
                                });
                            }
                        }
                    }
                });

                self.parent.model.set({priv: data.total_unread_messages_count});
                
                if (data.users.length != currentNumOfUsers) {
                    // Reset the current conversation title
                    self.resetTitle();
                    self.updateUserCount();
                    self.changeTitle(self.getTitle());
                }
            } else {
                // Display error modal and return to the conversations list
                self.parent.conversationUnavailableModal();
            }
        });
    },

    //Prepares messages and adds them to the message collection in the Conversation view
    handleMessages: function(messages, opts) {
        var self = this;
        var numPendingMessages = messages.length;
        var conversationListView = self.views.conversationListView;
        var messengerLandingView = self.parent.views.messengerLandingView;
        var listViewConvoModel, currentlyInCollection, messengerLandingViewConvoModel;

        $.each(messages, function(index, val) {
            //If the tracking id is the same as a stored tracking id from submitMessage(), do not handle this message
            //as it is a duplicate of a message that already exists in the thread and has already been addedd to the collection
            var msg = this;
            var trackingId = parseInt(msg.tracking_id, 10);

            var isInTracking = _.find(self.storedTrackingIds, function(id) {
                return id === trackingId;
            });

            if (!isInTracking) {
                var message = new MessageModel();
                message.set({ 
                    timestamp: self.generateTimestamp(this.created),
                    isPollMsg: true
                });

                if (this.producer.user_id === self.parent.currentUserId) {
                    message.set(this);
                    message.set({ history: 'true', type: 'outgoing' });
                } else {
                    message.set(this);
                    message.set({ type: 'incoming' });
                    if (index === numPendingMessages - 1) {
                        //The sound will be played in the updateMessenger poll after both instances of handleMessages are run
                        self.playSound = true;
                    }
                }

                if (opts && opts.isPrevUnread) {
                    message.set({ prevUnreadMsg: true });
                }

                if (this.details.video) {
                    //Grab expiry off of one of the asset URLs. This is ok here as both asset URLs should be up to date
                    var queryParams = this.details.video.substring(this.details.video.indexOf('?') + 1);
                    var QueryString = self.getQueryString(queryParams);
                    message.set('expiry', QueryString.exp * 1000); //Expiry comes back as seconds from the API

                    var details = message.get('details');
                    details.thumbnail = self.buildThumbnailUrl(details.thumbnail);
                    message.set('details', details);
                }

                var curMessage = this;

                currentlyInCollection = _.find(self.collection.models, function(msg) {
                    return msg.get('message_id') === curMessage.message_id;
                });

                if (!currentlyInCollection) {
                    self.collection.add(message);

                    if (index === messages.length - 1) {
                        if (self.localStorageCheck()) {
                            localStorage.setItem('messenger.currentConversationMessageId', this.message_id);
                        }
                    }
                }

                delete message;
            }
        });

        this.collection.sort();
    },

    //Loop through each of the conversation's users and check for the typing status
    checkConversationTypingStatuses: function(users, conversation_id) {
        var usersTyping = false;
        var self = this;

        $.each(users, function() {
            var typing_status = this.status.typing_status;
            
            if (typing_status && (typing_status.mobile || typing_status.web)) {
                if (this.user_id !== self.parent.currentUserId && (typing_status.web == conversation_id || typing_status.mobile == conversation_id)) {
                    usersTyping = true;
                    self.displayTypingTitle(this);
                }
            }
        });
        
        if (!usersTyping) {
            self.resetTitle();
        }
    },
    
    displayTypingTitle: function(user) {
        //Expecting a JSON object for user
        var typingTitle = $('#messenger-typing-title');

        if (!$('#messenger-minimized-title').is(':visible')) {
            $('#messenger-title').hide();
            $('.view-title-avatar', typingTitle).prop({
                'src': user.avatar,
                'title': user.username
            });
            typingTitle.show();
        }
    },
    
    loadMoreMessages: function(e) {
        var self = this,
            firstMsgId = self.collection.first().get('message_id') || null, // get the current first message id
            $chat = $('#messenger-chat-window'),
            $loadMore = $('#conversation-load-more');
            $loading = $loadMore.find('.loading'),
            $loadMoreLink = $('#conversation-more-link'),
            $firstMsg = $('#' + firstMsgId),
            num_to_request = 20,
            requestOpts = {
                conversation_id: self.parent.conversation.get('conversation_id'),
                max_id: self.collection.at(0).get('cursor_id'),
                number: num_to_request,
                mark_conversation_read: 0
            };
        
        // Init nanoScroller
        $chat.nanoScroller();
        
        // Show the loading icon and hide the load more link
        $loadMoreLink.fadeOut(400, function() {
            $loading.fadeIn();
        });        
        
        Keek.api('/message/message_list', requestOpts, function(data) {
            // Check api returns
            if (data.status.code === 2000) {
                // Messages
                $.each(data.messages, function() {
                    var msg = new MessageModel();
                    var timestamp = self.generateTimestamp(this.created, { prepend: true });
                    
                    msg.set(this);
                    
                    // Mark the current message as isLoadMoreMsg;
                    msg.set('isLoadMoreMsg', true);
                    
                    // Set the message type
                    if (this.producer.user_id === self.options.parent.currentUserId) {
                        msg.set({
                            history: true,
                            type:    'outgoing'
                        });
                    } else {
                        msg.set({type: 'incoming'});
                    }
                    
                    // Set timestamp
                    msg.set({timestamp: timestamp || null});
                    
                    // Save it to the messages collection
                    self.collection.push(msg);
                });
            } else {
                self.parent.modal.alert(data.status.message);
            }
            
            // Check is there any more older messages
            if (data.more_older_messages) {
                $loading.fadeOut(200, function() {
                $loadMoreLink.fadeIn();
                });
            } else {
                $loadMore.hide();
            }
            
            if ($firstMsg.position()) {
                $chat.nanoScroller({scrollTop: $firstMsg.position().top - parseInt($firstMsg.css('marginBottom'), 10)}); // minus the message bottom margin...
            }
        });
        
        e.preventDefault();
    },

    openAddFriend: function(e) {
        e.preventDefault();
        
        if (this.conversation.get('users').length >= this.parent.max_conversation_users) {
            this.parent.modal.alert('You have reached the maximum number of users per conversation', [{
                buttonClass: 'ok'
            }]);
        } else if (this.inMessageRequestState) {
            this.showMessageRequestErrorOverlay();
        } else {
            this.parent.navigateForward({
                target: this.parent.views.addFriendView,
                referrer: this.parent.views.conversationView
            });
        }
    },

    showAddFriendOverlay: function() {
        this.parent.views.addFriendOverlayView.resetUI();
        $('#messenger-modal').fadeIn(250, function() {
            $('#messenger-add-friend-overlay').show();
        });
    },

    //TODO: We should convert this to the custom modal framework
    showLeaveConversationOverlay: function(e) {
        e.preventDefault();
        this.parent.views.leaveConversationOverlayView.model.set({
            'conversation_id': this.parent.conversation.get('conversation_id'),
            'initiator': 'conversationView'
        });
        $('#messenger-modal').fadeIn(250, function() {
            $('#messenger-leave-convo-overlay').show();
        });
    },

    showEmailSentOverlay: function(e){
        e.preventDefault();
        $('#messenger-email-sent-overlay .messenger-email-sent-overlay-inside').css({bottom: '188px'});
        $('#messenger-email-sent-overlay').fadeIn(250).delay(500).fadeOut(250);
    },
    
    htmlspecialchars: function(string){
        return $('<span>').text(string).html();
    },
    
    submitMessage: function(e, isVideoMsg) {
        if (e) e.preventDefault();

        var self = this, textStaging = $('#text_stage'), addMessageOptions = {}, callback;
        var caption = this.chatInput.val().replace(/\s*$/,"").replace(/\+/g,"%2b");
        var curTime = Date.now();

        if (this.inMessageRequestState) {
            return false;
        }

        if (!$('.chat-send', this.$el).hasClass('disabled') || isVideoMsg) {
            var conversation = this.parent.conversation;
            var users = conversation.get('users');
            var users_pending_acceptance = conversation.get('users_pending_acceptance');
            var currentUserId = this.parent.currentUserId;
            var tracking = curTime;

            $('.chat-send', this.$el).addClass('disabled');
            this.typingStatus = false;

            //We want to have the message appended to the thread in the UI before it actually reaches the server. To the user,
            //it will look like there is no delay, but the "Delivered" status text will only appear once the message has successfully
            //hit the server. We're doing this on order to get around latency issues. If we don't handle it this way, the user will
            //not see any response on the UI until the message has successfully submitted.
            var producer = _.find(users, function(u){
                return u.user_id === currentUserId;
            });

            var message = new MessageModel({
                details: {
                    caption: self.htmlspecialchars(caption).replace(/%2b/g, "+")
                },
                notif_message: 'Sending',
                type: 'outgoing',
                created: curTime,
                cursor_id: curTime,
                timestamp: this.generateTimestamp(Date.now()),
                producer: producer,
                direction: this.parent.bidi(caption),
                rendered: true //Need to have this set or the message will get re-rendered when renderMessageCollection() is called
            });

            if (this.recordedKeek.id) {
                var details = message.get('details');

                addMessageOptions.file_id = this.recordedKeek.id;
                addMessageOptions.duration = this.recordedKeek.duration;
                addMessageOptions.video_type = "video/x-flv";
                addMessageOptions.orientation = 0;

                details.duration = this.recordedKeek.duration;
                details.orientation = 0;
                details.waitingForAssets = true;
                message.set('details', details);
            }

            addMessageOptions.caption = caption;
            addMessageOptions.conversation_id = this.conversation.get('conversation_id');
            addMessageOptions.tracking_id = tracking;

            this.storedTrackingIds.push(tracking);

            $(".notif-message:not(.error-message)").hide();

            //Add message to collection
            this.collection.add(message);
            // this.appendCachedMessages();
            // this.scrollToBottom();

            $('.chat-input', self.$el).focus().val('');

            //In callback, find the message model that was just added and update it based on the response

            callback = function(data) {
                Keek.onError = null;
                if (data.status.code == 2100) {
                    var conversationListView = self.parent.views.conversationListView;
                    var listViewConvoModel;

                    //If there is a video, reset the waitingForAssets flag so that the (temporarily) broken thumbnail that comes back with the response doesn't get appended
                    if (data.message.details.video) {
                        data.message.details.waitingForAssets = true;
                    }

                    //Hide the notification messages again just in case another message submitted after this one reached the callback
                    $(".notif-message:not(.error-message)").hide();

                    //Apply server data to message object
                    message.set(data.message);
                    message.set({
                        rendered: true,
                        notif_message: 'Delivered'
                    });

                    self.since_id = data.message.cursor_id;

                    if (self.collection.at(1) && self.collection.at(1).get('pendingAcceptance')) {
                        message.set({
                            pendingAcceptance: true,
                            notif_message: 'Pending approval'
                        });
                        $('.notif-message.error-message').show();
                    }

                    if (data.message.details.video) {
                        //Since the URL shoud only have one question mark in it, we'll grab the index of the question mark and take a substring from there to
                        //get the query parameters from the URL
                        var queryParams = data.message.details.video.substring(data.message.details.video.indexOf('?') + 1);
                        var QueryString = self.getQueryString(queryParams);

                        message.set('expiry', QueryString.exp * 1000); //Expiry comes back in seconds from the API. Need to convert to ms

                        var requestOpts = {
                            conversation_id: message.get('conversation_id'),
                            message_id: message.get('message_id')
                        };

                        var getMessageAssets = function() {
                            Keek.api('/message/get_message_asset_urls', requestOpts, function(r) {
                                if (r.status.code === 2000) {
                                    var details = message.get('details');
                                    details.video = r.message.details.video;
                                    details.thumbnail = self.buildThumbnailUrl(r.message.details.thumbnail);
                                    details.thumbnail_width = r.message.details.thumbnail_width;
                                    details.thumbnail_height = r.message.details.thumbnail_height;
                                    details.waitingForAssets = false;
                                    message.set('details', details);
                                    self._MessageViews[message.get('cid')].render();
                                    clearInterval(getMessageAssetsPoll);
                                }
                            });
                        };

                        var getMessageAssetsPoll = setInterval(getMessageAssets, 1000);
                    }

                    self.collection.sort();

                    if (self.localStorageCheck()) {
                        localStorage.setItem('messenger.currentConversationMessageId', data.message.message_id);
                    }

                    self.recordedKeek = {
                        id: null,
                        duration: null,
                        image: null
                    };

                    //Set latest message in conversation as the one displayed on the conversation list
                    listViewConvoModel = _.find(conversationListView.collection.models, function(conversation) {
                        return conversation.get('conversation_id') === self.conversation.get('conversation_id');
                    });

                    if (listViewConvoModel) {
                        listViewConvoModel.set({
                            'message': message.toJSON(),
                            'last_updated': message.get('created')
                        });
                        self.views.conversationListView.collection.sort();
                        self.views.conversationListView.render(true);
                    }

                    //Set latest message in conversation as the one displayed on the messenger landing
                    var messengerLandingView = self.parent.views.messengerLandingView;
                    var messengerLandingViewConvoModel;

                    if (messengerLandingView) {
                        messengerLandingViewConvoModel = _.find(messengerLandingView.collection.models, function(conversation) {
                            return conversation.get('conversation_id') === self.conversation.get('conversation_id');
                        });

                        if (messengerLandingViewConvoModel) {
                            messengerLandingViewConvoModel.set({
                                'message': message.toJSON(),
                                'last_updated': message.get('created')
                            });
                            messengerLandingView.collection.sort();
                            messengerLandingView.render(true);
                        }
                    }
                } else if (data.status.code === 4307) {
                    //User has attempted to send another message before anyone has accepted into the conversation.
                    //Display a modal with an alert prompt.
                    $('.notif-message').text('Not delivered');
                    self.parent.modal.alert(data.status.message);
                } else if (data.status.code === 4000) {
                    message.set({
                        type: 'error'
                    });

                    self.submitError();

                } else {
                    //Setting error state on the message object will force it to re-render in the error state
                    message.set({
                        type: 'error'
                    });
                    $('#messenger-chat-window').nanoScroller({ scroll: 'bottom' });
                }

                self.handleTextInputAutogrow();
            };

            //In the event the user loses connection while trying to send a message
            Keek.onError = function(){
                message.set({
                    type: 'error'
                });

                self.submitError();
            };

            //Send the message
            Keek.api('/message/add_message', 'post', addMessageOptions, callback);
        }
    },
    submitError: function(){
        $('.notif-message').addClass('error-message');
        this.handleTextInputAutogrow();

        if (this.recordedKeek.id){
            this.recordedKeekError = {
                id: this.recordedKeek.id,
                duration: this.recordedKeek.duration,
                image: null
            };

            this.recordedKeek = {
                id: null,
                duration: null,
                image: null
            };

            $('.conversation-message.error-message').addClass('video');
            $('.conversation-message .error-icon').addClass('video');
            $('.conversation-message .video-error').css('display', 'block');
            $('.incoming-message-loading-wrap.video-error').css('display', 'none');
        }
    },

    clearConversation: function(e) {
        var self = this;
        var conversation_id = this.parent.conversation.get('conversation_id');
        e.preventDefault();
        Keek.api('/message/clear_conversation', 'post', { conversation_id: conversation_id }, function(data) {
            self.navigateBack({
                target: self.views.conversationListView,
                referrer: self
            });
        });
    },

    hidePlayerOverlay: function(e) {
        e.preventDefault();
        $('#messenger-keek-overlay').fadeOut(250, function(){
            $('#main-messenger').remove();
        });
    },

    openParticipantList: function(e) {
        e.preventDefault();
        this.parent.navigateForward({
            target: this.views.conversationParticipantsView,
            referrer: this
        });
    },

    returnToConversationList: function() {
        this.parent.navigateForward({
            target: this.views.conversationListView,
            referrer: this
        });
    },

    toggleTray: function(e) {
        e.preventDefault();
        var self = this;
        var trayHeight = $('.messenger-other-actions-tray', self.el).height();
        var trayBtn = $('.open-tray', self.el);
        var requiresAcceptanceFor = this.parent.conversation.get('requires_user_acceptance_for');

        if (requiresAcceptanceFor && requiresAcceptanceFor.user.is_blocking === 1) {
            $('#messenger-modal').fadeIn(250, function() {
                $('#messenger-request-state-unblock-overlay .unblock').show();
                $('#messenger-request-state-unblock-overlay').show();
            });
            return false;
        } else if (this.inMessageRequestState) {
            this.showMessageRequestErrorOverlay();
            return false;
        } else if (this.inPendingAcceptanceState) {
            this.parent.modal.alert("You can't send messages while approval is pending");
            return false;
        }

        if ($('.icon-state', self.el).hasClass('icon-messenger-open')) {
            $('.icon-state', self.el).removeClass('icon-messenger-open');
            $('.icon-state', self.el).addClass('icon-messenger-close');
            }
        else{
            $('.icon-state', self.el).removeClass('icon-messenger-close');
            $('.icon-state', self.el).addClass('icon-messenger-open');
        }

        if (trayBtn.hasClass('open')) {
            $('.messenger-other-actions-tray', self.el).stop().hide(150);
            $('#messenger-chat-window').removeClass('short');
            $('.messenger-input-window', self.el).removeClass('tray-opened');
            trayBtn.removeClass('open');
        } else {
            $('#messenger-chat-window').addClass('short');
            $('.messenger-input-window', self.el).addClass('tray-opened');
            trayBtn.addClass('open');

            if (this.parent.conversation.get('users').length <= 2) {
                $('a.tray-tab.at-replies-tab', this.el).hide();
            } else {
                $('a.tray-tab.at-replies-tab', this.el).show();
            }

            $('.messenger-other-actions-tray', self.$el).stop().toggle('blind', 150);
            $('a.tray-tab.emoticons-tab', self.el).click();
        }
        this.handleTextInputAutogrow();
        $('#messenger-chat-window').nanoScroller({
            preventPageScrolling: true
        });
        $('.chat-input', this.el).focus();
    },

    openAtReplies: function(e) {
        var self = this;
        e.preventDefault();
        var trayScrollableDiv = $('.tray-at-replies', this.el);
        $('.tray-scrollable', this.el).hide();

        var conversationId = this.parent.conversation.get('conversation_id');
        $('.tray-at-replies div.content', this.el).empty();

        Keek.api('/message/conversation', { conversation_id: conversationId }, function(data) {
            var currentUserId = self.parent.currentUserId;
            $.each(data.conversation.users, function() {
                if (this.user_id !== currentUserId) {
                    var user = new UserModel(this);
                    var userView = new App.Views.TrayUserItemView({model: user, type: 'at', parent: self});
                    $('.tray-at-replies div.content', self.el).append(userView.render().el);
                }
            });
            $('.tray-at-replies').nanoScroller();
        });

        this.moveActiveArrow(56);
        trayScrollableDiv.show();
    },

    openEmoticons: function(e) {
        e.preventDefault();
        var trayScrollableDiv = $('.tray-emoticons', this.el);
        $('.tray-scrollable', this.el).hide();
        this.moveActiveArrow(16);
        trayScrollableDiv.show();
    },

    moveActiveArrow: function(left) {
        var activeArrow = $(".active-arrow", this.el);
        if (activeArrow.position().left !== left) {
            activeArrow.stop().animate({
                left: parseInt(left, 10)
            }, 250);
        }
    },

    selectEmoticon: function(e) {
        e.preventDefault();
        this.views.conversationView.typingStatus = true;
        el = $(e.target).parent('a');
        var emoticon = el.data('emoticon');
        if (typeof emoticon !== 'undefined') {
            var chatInput = this.chatInput;
            chatInput.val(chatInput.val() + emoticon);

            var content = chatInput[0];//returns a HTML DOM Object, $('.chat-input', this.el) returns a jQuery object
            chatInput.focus();
            this.placeCaretAtEnd(content);
            this.toggleSendButtonState(content);
            this.handleTextInputAutogrow();
            $('.chat-input-scroll', this.el).nanoScroller({ scroll: 'bottom' });
        }
    },

    toggleConversationSettings: function(e) {
        e.preventDefault();
        if ($('#messenger-settings-tray').hasClass('opened')) {
            $('#messenger-settings-tray').removeClass('opened');
        } else {
            $('#messenger-settings-tray').addClass('opened');
        }
    },

    createConvoEnterNotification: function(userEntered, producer) {
        var notification = new App.Views.ConversationNotificationView();
        notification.user = userEntered;
        notification.producer = producer;

        $('#messenger-chat-window .content-inside').append(notification.render().el);
        $('#messenger-chat-window').nanoScroller({ scroll: 'bottom' });
    },

    placeCaretAtEnd: function(el) {
        el.focus();
        if (typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } else if (typeof document.body.createTextRange != "undefined") {
            var textRange = document.body.createTextRange();
            textRange.moveToElementText(el);
            textRange.collapse(false);
            textRange.select();
        }
    },

    disableAudio: function(e) {
        this.parent.audioEnabled = false;
        $('#disable-audio').hide();
        $('#enable-audio').show();
        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.audioEnabled', false);
        }
        $('#messenger-settings-tray').removeClass('opened');
    },

    enableAudio: function(e) {
        this.parent.audioEnabled = true;
        $('#enable-audio').hide();
        $('#disable-audio').show();
        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.audioEnabled', true);
        }
        $('#messenger-settings-tray').removeClass('opened');
    },

    handleTextInputAutogrow: function(e) {        
        //Handles autogrowing of textarea
        //Put text from chat-input textarea into a staging <p>. After, we'll take the CSS height of the staging <p> and apply it to the textarea's wrapping container.
        //Constrained at a max height of 56px because 56px should represent four lines of text, as discussed
        var stagingTag = $('.chat-input-stage', this.el);
        var chatInput = $('.chat-input', this.el);
        var refreshScroll = false;
        var maxCharacterCount = 444;

        stagingTag.text(chatInput.val());

        //Handle growing/shrinking the text input.
        //Each line is 14px
        if (stagingTag.height() <= 56) {
            $('.chat-input-scroll', this.el).css('height', stagingTag.height());
            $('.chat-input-scroll', this.el).nanoScroller({ stop: true });
        } else if (stagingTag.height() > 56) {
            $('.chat-input-scroll', this.el).css('height', '56px');
            $('.chat-input-scroll', this.el).nanoScroller({
                preventPageScrolling: true,
                flash: false
            });
        }

        chatInput.height(stagingTag.height());

        //Handle showing/hiding the character counter
        //On third line, show character counter
        if (stagingTag.height() >= 42) {
            var currentCharacterCount = $('.chat-input', this.el).val().length;
            var characterDifference = maxCharacterCount - currentCharacterCount;
            $('.text-counter', this.el).show();
            if (characterDifference < 0) {
                $('.text-counter', this.el).addClass('zero');
                $('.chat-send', this.el).addClass('disabled');
            } else {
                $('.text-counter', this.el).removeClass('zero');
                $('.chat-send', this.el).removeClass('disabled');
            }
            $('.text-counter', this.el).text(characterDifference);
        } else {
            $('.text-counter', this.el).hide();
        }

        $('#messenger-chat-window').nanoScroller({
            preventPageScrolling: true
        });
    },

    toggleSendButtonState: function(inputElem) {
        if ($(inputElem).val() !== '' && $(inputElem).val().match(/^\s*$/) === null) {
            $('.chat-send', this.$el).removeClass('disabled');
        } else {
            $('.chat-send', this.$el).addClass('disabled');
        }
    },

    focusOnTextarea: function() {
        $('.chat-input', this.el).focus();
    },

    getSelectionHtml: function() {
        var html = "";
        if (typeof window.getSelection != "undefined") {
            var sel = window.getSelection();
            if (sel.rangeCount) {
                var container = document.createElement("div");
                for (var i = 0, len = sel.rangeCount; i < len; ++i) {
                    container.appendChild(sel.getRangeAt(i).cloneContents());
                }
                html = container.innerHTML;
            }
        } else if (typeof document.selection != "undefined") {
            if (document.selection.type == "Text") {
                html = document.selection.createRange().htmlText;
            }
        }
        return html;
    },

    getCaretPositionInContenteditable: function() {
        if (typeof window.getSelection != "undefined") {
            var sel = window.getSelection();
            if (sel.rangeCount === 1) {
                var offset = sel.focusOffset;
                return offset;
            } else {
                return false;
            }
        } else if (typeof document.selection != "undefined") {
            // if (document.selection.type == "Text") {
            //     html = document.selection.createRange().htmlText;
            // }
        }
    },

    //TODO: This should be converted to the custom modal framework
    showMessageRequestErrorOverlay: function() {
        $('#messenger-modal').fadeIn(250, function() {
            $('#messenger-request-state-error-overlay').show();
        });
    },

    openRecorder: function(e) {
        e.preventDefault();
        var opts = {};
        if (this.parent.conversation.get('requires_user_acceptance_for') && this.parent.conversation.get('requires_user_acceptance_for').user.is_blocking === 1) {
            $('#messenger-modal').fadeIn(250, function() {
                $('#messenger-request-state-unblock-overlay .unblock').show();
                $('#messenger-request-state-unblock-overlay').show();
            });
        } else if (this.inMessageRequestState) {
            this.showMessageRequestErrorOverlay();
            return false;
        } else if (this.inPendingAcceptanceState) {
            this.parent.modal.alert("You can't send messages while approval is pending");
            return false;
        } else {
            $('#messenger-keek-recorder').fadeIn(250, function() {
                swfobject.removeSWF('main-recorder');
                $('#messenger-keek-recorder').append('<div class="keek-overlay-inside" id="keek-recorder-inside"></div>');

                var params = {
                    allowscriptaccess: 'always',
                    allownetworking: 'all',
                    wmode: 'transparent',
                    allowFullScreen: 'true'
                };

                var attributes = {
                    id: "main-recorder",
                    name: "main-recorder"
                };

                swfobject.embedSWF("/swf/Webcam_Messenger_v2.swf", "keek-recorder-inside", "276", "346", "10.0.0", '', opts, params, attributes);
            });
        }
    },

    hideRecorder: function(e) {
        if (e) e.preventDefault();
        $('#messenger-keek-recorder').fadeOut(250);
        swfobject.removeSWF('main-recorder');
    },

    handleRecorderOutput: function(file_id, duration) {
        var self = this;

        this.recordedKeek = {
            id: file_id,
            duration: duration
        };

        this.submitMessage(null, true);

        this.hideRecorder();
    },

    recordScrollPosition: function() {
        //Record the scroll position in the scrollable window in both local storage and in memoryv
        var scrollTop = $('.content', this.$el).scrollTop();
        this.scrollTop = scrollTop;
        if (this.localStorageCheck()) {
            localStorage.setItem('messenger.conversationView.scrollTop', scrollTop);
        }
    },

    handleTrayMouseup: function(e) {
        var self = this;
        var tray_bottom_val = parseInt($('.conversation-bottom-content').css('bottom'), 10);
        var bottom_content_container, container;

        container = $('#messenger-conversation');
        bottom_content_container = $(".conversation-bottom-content", container);

        if ($('#messenger-settings-tray').hasClass('opened')) {
            $('#messenger-settings-tray').removeClass('opened');
        }

        if (bottom_content_container.has(e.target).length === 0 && $('.icon-state', container).hasClass('icon-messenger-open') && $('.chat-input', container).val().length === 0)
        {
            $('.chat-input-outside', container).removeClass('focused');
            $('a.record-private', container).removeClass('shifted');
        }
        else if (bottom_content_container.has(e.target).length === 0 && $('.icon-state', container).hasClass('icon-messenger-close') && $('#messenger-new-message .content-inside').has(e.target).length === 0)
        {
            $('.chat-input-outside', container).removeClass('focused');
            $('a.record-private', container).removeClass('shifted');
            self.toggleTray(e);
        }
    },

    //This function will invoke automatically and parse out URL parameters from a supplied URL.
    //Modified from http://stackoverflow.com/questions/979975/how-to-get-the-value-from-url-parameter
    getQueryString: function(params) {
        // This function is anonymous, is executed immediately and 
        // the return value is assigned to QueryString!
        var query_string = {};
        var query = params;
        var vars = query.split("&");
        for (var i=0;i<vars.length;i++) {
            var pair = vars[i].split("=");
            // If first entry with this name
            if (typeof query_string[pair[0]] === "undefined") {
                query_string[pair[0]] = pair[1];
            // If second entry with this name
            } else if (typeof query_string[pair[0]] === "string") {
                var arr = [ query_string[pair[0]], pair[1] ];
                query_string[pair[0]] = arr;
            // If third or later entry with this name
            } else {
                query_string[pair[0]].push(pair[1]);
            }
        }
        return query_string;
    },

    buildThumbnailUrl: function(url) {
        var queryPos = url.indexOf('?');
        var plainUrl = url.substring(0, queryPos);
        var urlParams = url.substring(queryPos);
        return plainUrl + '/w60/h45' + urlParams;
    }
});

App.Views.ConversationMessageView = Backbone.View.extend({
    tagName: 'div',
    attributes : function () {
        var cssClass;
        var type = this.model.get('type');

        if (type === 'outgoing' || type === 'request') {
            cssClass = 'conversation-message-wrap outgoing-message-wrap' + (type === 'request' ? ' request' : '');
        } else if (type === 'incoming') {
            cssClass = 'conversation-message-wrap incoming-message-wrap';
        } else if (type === 'error') {
            cssClass = 'conversation-message-wrap error-message-wrap';
        } else if (type === 'acceptance-pending') {
            cssClass = 'conversation-message-wrap acceptance-pending-wrap';
        } else if (type === 'also-invited') {
            cssClass = 'conversation-message-wrap also-invited';
        }

        return {
            'class': cssClass,
            id: this.model.get('message_id'),
            'data-cid': this.cid
        };
    },
    events: {
        'click .list-user-img' : 'loadUserProfile',
        'click .list-user-img-outgoing' : 'loadUserProfile',
        'click .msg-try-again' : 'resendMessage',
        'click .accept': 'acceptRequest',
        'click .delete': 'openActionsModal',
        'click .unblock': 'openUnblockUserModal',
        'click .username-to-profile': 'loadUserProfile',
        'click a.incoming-message-video-link' : 'loadVideoInMessage'
    },
    initialize: function() {
        this.parent = this.options.parent;
        this.listenTo(this.model, 'change', this.render);
        this.listenTo(this.model, 'remove', this.remove);
    },
    render: function() {
        this.determineTemplate();
        
        if (this.parent.inPendingAcceptanceState && this.parent.users_pending_acceptance.length == 0) {
            $('.acceptance-pending .pre-accept').html('Everyone you invited has deleted your conversation request.');
        }
        
        this.$el.html(this.template(this.model.toJSON()));
        this.$el.prop('id', this.model.get('message_id'));
        // if ($('#' + this.model.get('message_id')).length > 0) {
        //     $('#' + this.model.get('message_id')).html(this.template(this.model.toJSON()));
        // } else if ($(".conversation-message-wrap[data-cid='" + this.model.get('cid') + "']").length > 0) {
        //     $(".conversation-message-wrap[data-cid='" + this.model.get('cid') + "']").html(this.template(this.model.toJSON()));
        // }
        return this;
    },
    determineTemplate: function() {
        var type = this.model.get('type');

        if (type === 'outgoing') {
            this.template = _.template($('#tmpl-outgoing-message').html());
        } else if (type === 'incoming' || type === 'request') {
            if (this.model.attributes.details && _.has(this.model.attributes.details, "state")){
                this.template = _.template($('#tmpl-conversation-notification').html());
            }
            else{
                this.template = _.template($('#tmpl-incoming-message').html());
            }
        } else if (type === 'error') {
            this.template = _.template($('#tmpl-error-message').html());
        } else if (type === 'acceptance-pending') {
            this.template = _.template($('#tmpl-acceptance-pending').html());
        } else if (type === 'also-invited') {
            this.template = _.template($('#tmpl-also-invited').html());
        }
    },
    resendMessage: function(e) {
        e.preventDefault();
        var self = this;
        var previousCaption = self.model.get('details').caption;
        var curDate = Date.now();
        var addMessageOpts = {
            caption: previousCaption,
            conversation_id: self.options.parent.conversation.get('conversation_id'),
            tracking_id: curDate
        };

        $(e.target).parent().closest('div.conversation-message-wrap').addClass('errored');

        this.parent.storedTrackingIds.push(curDate);

        if (self.model.get('details').duration) {
            addMessageOpts.file_id = this.parent.recordedKeekError.id;
            addMessageOpts.duration = this.parent.recordedKeekError.duration;
            addMessageOpts.video_type = "video/x-flv";
            addMessageOpts.orientation = 0;
        }

        Keek.api('/message/add_message', 'post', addMessageOpts, function(data) {
            if (data.status.code == 2100) {

                $(".notif-message:not(.error-message)").hide();

                if (data.message.details.video) {
                    $('.incoming-message-loading-wrap.video-error').css('display', 'block');
                }

                self.model.set({
                    timestamp: self.options.parent.generateTimestamp(data.message.created),
                    notif_message: 'Sending',
                    type: 'outgoing'
                });

                var message = new MessageModel();
                //Apply message id to message
                message.set(data.message);
                message.set({
                    timestamp: self.options.parent.generateTimestamp(data.message.created),
                    notif_message: 'Delivered',
                    type: 'outgoing'
                });

                if (data.message.details.video) {

                    //Grab expiry off of one of the asset URLs. This is ok here as both asset URLs should be up to date
                    var queryParams = data.message.details.video.substring(data.message.details.video.indexOf('?') + 1);
                    var QueryString = self.parent.getQueryString(queryParams);
                    message.set('expiry', QueryString.exp * 1000); //Expiry comes back as seconds from the API

                    var details = message.get('details');
                    details.thumbnail = self.buildThumbnailUrl(details.thumbnail);
                    message.set('details', details);

                    function addMessage(){
                        self.parent.collection.add(message);
                    }

                    setTimeout(addMessage, 1000);

                    $('.errored').delay(1500).fadeOut(500, function(){
                        self.model.destroy();
                    });

                } else {
                    self.parent.collection.add(message);
                    $('.errored').fadeOut(500, function(){
                        self.model.destroy();
                    });
                }

                self.parent.recordedKeekError = {
                    id: null,
                    duration: null,
                    image: null
                };

                $('#messenger-chat-window').nanoScroller({ scroll: 'bottom' });

                if (self.parent.localStorageCheck()) {
                    localStorage.setItem('messenger.currentConversationMessageId', data.message.message_id);
                }

                delete message;

            } else {
                //ANOTHER ERROR STATE?
                //ANOTHER ERROR STATE???
                //METAL GEAR?!?!
            }
        });
    },
    acceptRequest: function(e) {
        e.preventDefault();
        var self = this;
        var requestOpts = {
            conversation_id: this.parent.conversation.get('conversation_id'),
            from_user_id: this.model.get('producer').user_id
        };

        Keek.api('/message/accept_message_request', 'post', requestOpts, function(data) {
            if (data.status.code === 2000) {
                //Request is now accepted
                self.parent.inMessageRequestState = false;
                self.parent.fetch();
            } else {
                self.parent.parent.modal.alert(data.status.message);
            }
        });
    },
    openActionsModal: function(e) {
        e.preventDefault();
        this.parent.parent.views.requestStateControlsOverlayView.showOverlay();
    },
    openUnblockUserModal: function(e) {
        e.preventDefault();
        $('#messenger-modal').fadeIn(250, function() {
            $('#messenger-request-state-unblock-overlay .unblock').show();
            $('#messenger-request-state-unblock-overlay').show();
        });
    },
    loadUserProfile: function(e) {
        e.preventDefault();
        var messenger_main = this.parent.parent;
        var selectedUserId;
        if (this.model.get('type') === 'request' || this.model.get('type') === 'incoming' || this.model.get('type') === 'outgoing') {
            //This is a message request and there should be a user in the model
            if (this.model.attributes.details && _.has(this.model.attributes.details, "state")) {
                selectedUserId = this.model.get('details').user.user_id;
            } else {
                selectedUserId = this.model.get('producer').user_id;
            }
        } else {
            e.stopImmediatePropagation();
            //This is an acceptance pending message, and the ID we need is on the element itself
            var elemId = $(e.target).closest('a.username-to-profile').prop('id');

            //Since this can be a pre-accept or post-accept user, we need to account for both possibilities
            //TODO: This is kinda crappy, maybe consider changing it
            if (elemId.indexOf('acc-pre-') >= 0) {
                selectedUserId = elemId.replace('acc-pre-', '');
            } else if (elemId.indexOf('acc-post-') >= 0) {
                selectedUserId = elemId.replace('acc-post-', '');
            } else if (elemId.indexOf('also-') >= 0) {
                selectedUserId = elemId.replace('also-', '');
            }
        }
        messenger_main.views.profileView.userId = selectedUserId;
        messenger_main.navigateForward({
            target: messenger_main.views.profileView,
            referrer: this.parent
        });
    },
    close: function() {
        //http://andrewhenderson.me/tutorial/how-to-detect-backbone-memory-leaks/
    
        this.model.unbind('change', this.render, this ); // Unbind reference to the model
        this.model.unbind('remove', this.remove, this ); // Unbind reference to the model

        delete this.$el;
        delete this.el;
        this.unbind();
        this.stopListening();
    },
    buildThumbnailUrl: function(url) {
        var queryPos = url.indexOf('?');
        var plainUrl = url.substring(0, queryPos);
        var urlParams = url.substring(queryPos);
        return plainUrl + '/w60/h45' + urlParams;
    },
    loadVideoInMessage: function(e) {
        e.preventDefault();
        var self = this;
        var expiry = this.model.get('expiry');
        var handlePlay = function() {
            var video_url = self.model.get('details').video;
            var image_url = self.model.get('details').thumbnail;
            var duration = self.model.get('details').duration;
            var trackviewUrl = self.model.get('details').trackviewUrl;
            var trackviewPostKey = self.model.get('details').trackviewPostKey;
            var trackviewPostValue = self.model.get('details').trackviewPostValue;

            self.playKeekInOverlay({
                "autoplay" : true,
                "duration" : parseInt(duration, 10),
                "video_url" : encodeURIComponent(video_url),
                "image_url" : encodeURIComponent(image_url),
                "image_width": self.model.get('details').thumbnail_width,
                "image_height": self.model.get('details').thumbnail_height,
                "trackviewUrl": encodeURIComponent(trackviewUrl),
                "trackviewPostKey": trackviewPostKey, 
                "trackviewPostValue": trackviewPostValue,
            });

            //Truncate text
            var textElem = $('#keek-overlay-bottom p');
            var divElementHeight = $('#keek-overlay-bottom').height();

            textElem.html(self.model.get('details').caption);
        };


        var requestOpts = {
            conversation_id: this.model.get('conversation_id'),
            message_id: this.model.get('message_id')
        };

        Keek.api('/message/get_message_asset_urls', requestOpts, function(data) {
            //returns message.details.video & message.details.thumbnail
            //Update message model's details object with the new video url and thumbnail
            var details = self.model.get('details');
            details.video = data.message.details.video;
            details.thumbnail = self.buildThumbnailUrl(data.message.details.thumbnail);
            details.thumbnail_width = data.message.details.thumbnail_width;
            details.thumbnail_height = data.message.details.thumbnail_height;
            self.model.set('details', details);
            handlePlay();
        });

    },
    playKeekInOverlay: function(opts) {
        swfobject.removeSWF('main-messenger');
        $('#messenger-keek-overlay').fadeIn(250, function() {
            $('#messenger-keek-overlay').append('<div class="keek-overlay-inside" id="keek-overlay-inside"></div>');

            var params = {
                allowscriptaccess: 'always',
                allownetworking: 'all',
                wmode: 'opaque',
                allowFullScreen: 'true'
            };

            var attributes = {
                id: "main-messenger",
                name: "main-messenger"
            };

            swfobject.embedSWF("/swf/Keek_Video_MessengerPlayer_v2.swf", "keek-overlay-inside", "276", "295", "10.0.0", '', opts, params, attributes);
        });
    }
});

App.Views.TrayUserItemView = Backbone.View.extend({
    tagName: 'div',
    attributes: {
        'class': 'list-user right-content-user new-message-user'
    },
    events: {
        'click': 'handleClick'
    },
    template: _.template($('#tmpl-new-message-user-item').html()),
    initialize: function() {
        this.parent = this.options.parent;
    },
    render: function() {
        this.$el.html(this.template(this.model.toJSON()));
        this.$el.prop('id', 'nm-user-' + this.model.get('user_id'));
        return this;
    },
    handleClick: function(e) {
        e.preventDefault();
        var type = this.options.type;
        if (type === 'at') {
            this.selectAt();
        } else {
            return false;
        }
    },
    selectAt: function() {
        var username = this.model.get('username');
        var chatInput = $('.chat-input', this.parent.el);
        var usernameString, enteredText;

        if (chatInput.val() === '' || chatInput.val() === 'Type a message...') {
            usernameString = '@' + username + ' ';
            chatInput.val(usernameString);
        } else {
            enteredText = chatInput.val() + '@' + username + ' ';
            chatInput.val(enteredText);
        }
        this.parent.parent.views.conversationView.handleTextInputAutogrow();
        var content = chatInput[0];//returns a HTML DOM Object, $('.chat-input', this.el) returns a jQuery object
        this.placeCaretAtEnd(content);
        this.parent.toggleSendButtonState(chatInput);
    },
    placeCaretAtEnd: function(el) {
        el.focus();
        if (typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } else if (typeof document.body.createTextRange != "undefined") {
            var textRange = document.body.createTextRange();
            textRange.moveToElementText(el);
            textRange.collapse(false);
            textRange.select();
        }
    }
});

App.Views.IncomingNotification = Backbone.View.extend({
    tagName: 'div',
    template: _.template($('#tmpl-incoming-message').html()),
    attributes : function () {
        return {
            'class': 'messenger-conversation-notif'
        };
    },
    render: function() {
        this.$el.html(this.template({
            user: this.details.user.toJSON(),
            producer: this.details.producer.toJSON()
        }));

        return this;
    }
});

App.Views.AddFriendOverlay = App.Views.Messenger.extend({
    el: $('#messenger-add-friend-overlay'),
    viewName: 'addFriendOverlayView',
    events: {
        'click a.from-keek' : 'openAddFriend',
        'click a.email-invite' : 'openAddFriendEmail',
        'click a.cancel-add-email' : 'backToAddFriend',
        'click a.cancel-add-friend' : 'fadeOutOverlay',
        'click a.send-friend-email' : 'submitInvite'
    },
    initialize: function() {
        this.parent = this.options.parent;
    },
    resetUI: function() {
        $(".send-email-inside").hide();
        $(".add-friend-inside").show();
    },
    render: function() {
        return this;
    },
    openAddFriend: function(e) {
        e.preventDefault();
        this.parent.navigateForward({
            target: this.parent.views.addFriendView,
            referrer: this.parent.views.conversationView
        });
        this.hideOverlay();
    },
    openAddFriendEmail: function(e) {
        e.preventDefault();
        $(".add-friend-inside").hide();
        $(".send-email-inside").show();
    },
    hideOverlay: function(e) {
        if (e) e.preventDefault();
        this.$el.hide();
        $('#messenger-modal').hide();
        $('.messenger-modal-inside').hide();
    },
    fadeOutOverlay: function(e) {
        if (e) e.preventDefault();
        this.$el.hide();
        $('#messenger-modal').fadeOut(250, function() {
            $('.messenger-modal-inside').hide();
        });
    },
    backToAddFriend: function(e){
        if (e) e.preventDefault();
        $(".send-email-inside").hide();
        $(".add-friend-inside").show();
    },
    validateEmailAddress: function(emailAddress) {
        var pattern = new RegExp(/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?$/i);
        return pattern.test(emailAddress);
    },
    submitInvite: function(e) {
        e.preventDefault();

        var emailAddress = $.trim($('#add-friend-recipient', this.$el).val());
        if (this.validateEmailAddress(emailAddress)) {
            $(".email-error").hide();
            //clear input box and disable the send button to avoid prepopulation when the user comes back
            $('#add-friend-recipient', this.$el).val('');
            //Process the email invite, send to a PHP route?
            this.hideOverlay();
            this.popHud('Email Sent');
        } else {
            $(".email-error").show();
            $('#add-friend-recipient', this.$el).addClass('invalid-email');
            return false;
        }
    },
    // Todo
    popHud: function(message) {
        $('#messenger-generic-hud p').text(message);
        this.centerHud();
        $('#messenger-generic-hud').fadeIn(250).delay(1500).fadeOut(250);
    },
    // Todo
    centerHud: function() {
        //Center the hud based on the text that has been entered in it
        var hud = $('#messenger-generic-hud');
        var chat_window = $('#messenger-chat-window');
        var left_pos = (chat_window.width() - hud.outerWidth()) / 2;
        
        hud.css('left', left_pos);
    }
});

var LeaveConversationOverlayModel = Backbone.Model.extend({
    defaults: function() {
        return {
            type: 'leave',
            conversation_id: null,
            initiator: null,
            num_participants: 0
        };
    }
});

/**
 * Abstract class for the overlay view classes
 * Abstract methods:
 *   deleteRequest()
 *   blockUser()
 *   unblockUser()
 *   reportUser()
 *   fadeOutOverlay()
 */
var OverlayAbstract = App.Views.Messenger.extend({
    modelWrap: null,
    parent: null,
    
    //Todo
    //template: null,
    
    el: null,
    
    events: {
        'click a.delete'  : 'deleteRequest',
        'click a.block'   : 'blockUser',
        'click a.unblock' : 'unblockUser',
        'click a.report'  : 'reportUser',
        'click a.cancel'  : 'fadeOutOverlay'
    },
    
    initialize: function() {
        throw 'Can\'t use the abstract class directly.';
    },
    
    // Use _initialize() insetead of initialize().
    _initialize: function() {
        this.modelWrap = $('#messenger-modal');
        this._getParentView();
    },
    
    // Get parent view model.
    _getParentView: function() {
        this.parent = this.options.parent;
    },
    
    // Set the state
    _setState: function(state) {
        if (state != OverlayAbstract.constStateBlock && state != OverlayAbstract.constStateUnblock) {
            throw 'The state string is invalid.';
        } else {
            this.parent.views.conversationView.collection.at(0).set('state', state);
            
            return this;
        }
    },
    
    _getApiCallMethod: function(method) {
        if (method != OverlayAbstract.constMethodPost &&
            method != OverlayAbstract.constMethodGet &&
            method != OverlayAbstract.constMethodPut)
        { throw 'Wrong method.'; }
        
        return method;
    },
    
    blockUser: function(e) {
        e.preventDefault();
        
        var self = this,
            userID = self.parent.views.conversationView.collection.at(0).get('producer').user_id;
        
        Keek.api('/block/create', OverlayAbstract.constMethodPost, { user_id: userID }, function(data) {
            $.when(self.fadeOutOverlay(e)).then(function() {                
                try {
                    if (data.status.code === 2000) {
                        self._setState(OverlayAbstract.constStateBlock).popHud('Blocked');
                    } else if (data.status.code === 4042) {
                        throw 'You have already blocked this user';
                    } else {
                        throw 'An error occured while trying to block this user';
                    }
                } catch(e) {
                    self.parent.modal.alert(e);
                }
            });
        });
    },
    
    unblockUser: function(e) {
        e.preventDefault();
        
        var self = this,
            userID = self.parent.views.conversationView.collection.at(0).get('producer').user_id,
            currentUsers = self.parent.conversation.get('users');
        
        Keek.api('/block/destroy', OverlayAbstract.constMethodPost, { user_id: userID }, function(data) {
            $.when(self.fadeOutOverlay(e)).then(function() {                
                try {
                    if (data.status.code === 2000) {
                        var requiresAcceptanceForUserIsInConversation = _.find(currentUsers, function(user) { 
                            return user.user_id === userID;
                        });
                        
                        self._setState(OverlayAbstract.constStateUnblock).popHud('Unblocked');
                    } else {
                        throw 'An error occured while trying to block this user';
                    }
                } catch(e) {
                    self.parent.modal.alert(e);
                }
            });
        });
    },
    
    reportUser: function(e) {
        e.preventDefault();
        
        var self = this,
            userID = self.parent.views.conversationView.collection.at(0).get('producer').user_id;        
        
        Keek.api('/user/report', OverlayAbstract.constMethodPost, { user_id: userID }, function(data) {
            $.when(self.fadeOutOverlay(e)).then(function() {
                if (data.status.code === 2000) {
                    self.popHud('Reported');
                } else if (data.status.code === 4041) {
                    self.parent.modal.alert('You have already reported this user');
                } else {
                    self.parent.modal.alert('An error occurred while trying to report this user');
                }
            });
        });
    },
    
    fadeOutOverlay: function(e) {
        if (e) e.preventDefault();
        
        var self = this;
        
        self.modelWrap.animate({
            opacity: 'hide'
        }, {
            duration: 250,
            complete: function() {
                self.$el.hide();
            }
        });
        
        return self;
    },
    
    // Todo
    deleteRequest: function(e) {
        e.preventDefault();
        
        var self = this;
        var conversationView = self.parent.views.conversationView;
        var conversationListView = self.parent.views.conversationListView;
        var conversation_id = conversationView.conversation.get('conversation_id');
        var conversationModel = conversationListView.collection.models.length === 0 ? null : _.find(conversationListView.collection.models, function(convo) {
            return convo.get('conversation_id') === conversation_id;
        });
        
        var messengerLandingView = self.parent.views.messengerLandingView;
        var messengerConversationModel = messengerLandingView ? messengerLandingView.collection.models.length === 0 ? null : _.find(messengerLandingView.collection.models, function(convo) {
            return convo.get('conversation_id') === conversation_id;
        }) : null;
        
        Keek.api('/message/leave_conversation', OverlayAbstract.constMethodPost, { conversation_id: conversation_id }, function(data) {
            conversationView.inMessageRequestState = false;
            if (conversationModel !== null) {
                conversationListView.collection.remove(conversationModel);
            }
            
            if (messengerConversationModel !== null) {
                messengerLandingView.collection.remove(messengerConversationModel);
                messengerLandingView.render();
            }
            
            self.fadeOutOverlay().parent.navigateBack();
        });
    },
    
    // Todo
    popHud: function(message) {
        $('#messenger-generic-hud p').text(message);
        this.centerHud();
        $('#messenger-generic-hud').fadeIn(250).delay(1500).fadeOut(250);
    },
    // Todo
    centerHud: function() {
        //Center the hud based on the text that has been entered in it
        var hud = $('#messenger-generic-hud');
        var chat_window = $('#messenger-chat-window');
        var left_pos = (chat_window.width() - hud.outerWidth()) / 2;
        
        hud.css('left', left_pos);
    }
}, {
    // Constants
    constMethodPost: 'post',
    constMethodGet: 'get',
    constMethodPut: 'put',
    constStateBlock: 'blocked',
    constStateUnblock: null
});

App.Views.LeaveConversationOverlay = App.Views.Messenger.extend({
    el: $('#messenger-leave-convo-overlay'),
    events: {
        'click a.leave': 'leaveConversation',
        'click a.delete': 'leaveConversation',
        'click a.cancel': 'fadeOutOverlay'
    },
    model: new LeaveConversationOverlayModel(),
    initialize: function() {
        this.parent = this.options.parent;
        this.model.bind('change', this.render, this);
        this.render();
    },
    render: function() {
        this.updateModalUI();
        return this;
    },
    leaveConversation: function(e) {
        e.preventDefault();        
        
        var self = this;
        var conversation_id = this.model.get('conversation_id');
        
        // Get the selected conversation model
        var conversationListView = this.parent.views.conversationListView;
        var conversationModel = conversationListView.collection.models.length === 0 ? null : _.find(conversationListView.collection.models, function(convo) {
            return convo.get('conversation_id') === conversation_id;
        });
        
        // Get the messenger landing conversation model
        var messengerLandingView = this.parent.views.messengerLandingView;
        var messengerConversationModel = messengerLandingView ? messengerLandingView.collection.models.length === 0 ? null : _.find(messengerLandingView.collection.models, function(convo) {
            return convo.get('conversation_id') === conversation_id;
        }) : null;
        
        Keek.api('/message/leave_conversation', 'post', { conversation_id: conversation_id }, function(data) {
            var remainingPendingMsgs;
            var currentPendingMsgs = self.parent.model.get('priv');
            
            if (data.status.code == 2000) {                
                // Update the messenger conversation list
                if (conversationModel !== null) {
                    conversationListView.collection.remove(conversationModel);
                    conversationListView.render();
                }
                
                // Update the landing page
                if (messengerConversationModel !== null) {
                    messengerLandingView.collection.remove(messengerConversationModel);
                    messengerLandingView.render();
                }
                
                if (conversationModel) {
                    remainingPendingMsgs = currentPendingMsgs - conversationModel.get('messages_pending');
                } else if (messengerConversationModel) {
                    remainingPendingMsgs = currentPendingMsgs - messengerConversationModel.get('messages_pending');
                }
                
                self.parent.model.set('priv', remainingPendingMsgs);
                
                if (self.model.get('initiator') === 'conversationView') {
                    self.hideOverlay();
                    self.parent.navigateBack(); //No need to specify a target. The only direction we can go in is the conversationListView
                } else {
                    self.fadeOutOverlay();
                }
                
                // Unset the conversation id
                self.model.set('conversation_id', null);
            } else {
                // Display the error
                self.parent.modal.alert(data.status.message, [{
                    buttonClass: 'ok'
                }]);
            }
        });
    },
    hideOverlay: function(e) {
        if (e) e.preventDefault();
        this.$el.hide();
        $('.messenger-modal-inside').hide();
        $('#messenger-modal').hide();
    },
    fadeOutOverlay: function(e) {
        if (e) e.preventDefault();
        this.$el.hide();
        $('#messenger-modal').fadeOut(250, function() {
            $('.messenger-modal-inside').hide();
        });
    },
    updateModalUI: function() {        
        if (this.model.get('type') === 'leave') {
            this.$el.find('.delete-action').hide();
            this.$el.find('.leave-action').show();
            
            if (this.model.get('num_participants') > 2) {
                this.$el.find('.leave-group').show();
                this.$el.find('.leave-private').hide();
            } else {
                this.$el.find('.leave-group').hide();
                this.$el.find('.leave-private').show();
            }
        } else if (this.model.get('type') === 'delete') {
            this.$el.find('.leave-action').hide();
            this.$el.find('.leave-group').hide();
            this.$el.find('.leave-private').hide();
            this.$el.find('.delete-action').show();
        }
    }
});

App.Views.RequestStateErrorOverlay = App.Views.Messenger.extend({
    el: $('#messenger-request-state-error-overlay'),
    events: {
        'click a.accept' : 'acceptRequest',
        'click a.cancel' : 'fadeOutOverlay'
    },
    initialize: function() {
        this.parent = this.options.parent;
    },
    render: function() {
        return this;
    },
    acceptRequest: function(e) {
        e.preventDefault();
        //TODO: This is a really dodgy way of handling this; consider other options
        $('#messenger-chat-window .accept').click();
        this.fadeOutOverlay();
    },
    fadeOutOverlay: function(e) {
        if (e) e.preventDefault();
        this.$el.hide();
        $('#messenger-modal').fadeOut(250);
    }
});

App.Views.RequestStateControlsOverlay = OverlayAbstract.extend({    
    events: {},
    
    initialize: function() {
        // Call the parent constructor
        this._initialize();
        
        // Extend the current events
        _.defaults(this.events, OverlayAbstract.prototype.events);
        
        // Set the current overlay DOM element
        this.el = $('#messenger-request-state-controls-overlay');
    },
    
    render: function() {
        return this;
    },
    
    showOverlay: function () {        
        // Set the privates
        var self = this,
            _state = self.parent.views.conversationView.collection.at(0).get('state'),
            _blockBtn = self.modelWrap.find('.block'),
            _unblockBtn = self.modelWrap.find('.unblock');
        
        self.modelWrap.animate({
            opacity: 'show'
        }, {
            duration: 250,
            complete: function() {
                if (_state === 'blocked') {
                    _unblockBtn.show();
                    _blockBtn.hide();
                } else {
                    _blockBtn.show();
                    _unblockBtn.hide();
                }
                
                self.$el.show();
            }
        });
        
        return self;
    }
});

App.Views.RequestStateUnblockOverlay = App.Views.Messenger.extend({
    el: $('#messenger-request-state-error-overlay'),
    events: {
        'click a.unblock' : 'unblockUser',
        'click a.cancel' : 'fadeOutOverlay'
    },
    initialize: function() {
        this.parent = this.options.parent;
    },
    render: function() {
        return this;
    },
    
    unblockUser: function(e) {
        e.preventDefault();
        var self = this;
        var user_id = self.parent.views.conversationView.collection.at(0).get('producer').user_id;

        Keek.api('/block/destroy', 'post', { user_id: user_id }, function(data) {
            if (data.status.code === 2000) {
                //Is this user still in the conversation?
                var current_users = self.parent.conversation.get('users');
                var requiresAcceptanceForUserIsInConversation = _.find(current_users, function(user) { 
                    return user.user_id === user_id;
                });
                self.parent.views.conversationView.collection.at(0).set('state', '');

                var reqUserAccceptanceObj = self.parent.conversation.get('requires_user_acceptance_for');
                reqUserAccceptanceObj.user.is_blocking = 0;
                self.parent.conversation.set('requires_user_acceptance_for', reqUserAccceptanceObj);

                reqUserAccceptanceObj = self.conversation.get('requires_user_acceptance_for');
                reqUserAccceptanceObj.user.is_blocking = 0;
                self.conversation.set('requires_user_acceptance_for', reqUserAccceptanceObj);

                self.hideOverlay();
                self.popHud('Unblocked');
            } else {
                self.parent.modal.alert('An error occured while trying to block this user');
            }
        });
    },
    
    fadeOutOverlay: function(e) {
        if (e) e.preventDefault();
        this.$el.hide();
        $('#messenger-modal').fadeOut(250, function() {
            $('.messenger-modal-inside').hide();
        });
    },
    hideOverlay: function(e) {
        if (e) e.preventDefault();
        this.$el.hide();
        $('.messenger-modal-inside').hide();
        $('#messenger-modal').hide();
    },
    popHud: function(message) {
        $('#messenger-generic-hud p').text(message);
        this.centerHud();
        $('#messenger-generic-hud').fadeIn(250).delay(1500).fadeOut(250);
    },
    centerHud: function() {
        //Center the hud based on the text that has been entered in it
        var hud = $('#messenger-generic-hud');
        var chat_window = $('#messenger-chat-window');
        var left_pos = (chat_window.width() - hud.outerWidth()) / 2;

        hud.css('left', left_pos);
    }
});

//*** Profile view
//*******************************************
App.Views.Profile = App.Views.Messenger.extend({
    el: $('#messenger-profile'),
    tagName: "div",
    viewName: 'profileView',
    model: new UserModel(),
    template: _.template($('#tmpl-profile').html()),
    defaultTransition: 'left',
    title: '',
    active: false,
    userId: null,
    headerNavigationType: 'back',
    defaultNavigationTarget: {
        conversationView: 'conversationView',
        conversationParticipantsView: 'conversationParticipantsView'
    },
    events: {
        'click #message-user' : 'openConversationWithUser',
        'click #messenger-block-btn': 'handleBlockUser'
    },
    initialize: function() {
        this.parent = this.options.parent;
        this.listenTo(this.model, 'change', this.changeFollowSubscribeCount);
    },
    
    resetUI: function() {
        $('div.messenger-profile-inside .content', this.el).empty();
        $('div.messenger-view-top-holder #message-user').hide();
    },
    
    fetch: function() {
        var self = this, userId;        
        
        if (!this.userId) {
            userId = localStorage.getItem('messenger.profile.userId');
            if (!userId) this.parent.navigateBack();
        } else {
            userId = this.userId;
        }
    
        Keek.api('/user/profile', { user_id: userId }, function(data) {
            // Check the response data status.
            if (data.status.code < 4000) {
                self.model.set(data.user);
                
                self.model.set({
                    bio: self.getBio(data.user.bio),
                    gender: self.getGender(data.user.gender),
                    birthdate: self.getAge(data.user.birthdate),
                    membersince: $.datepicker.formatDate('MM d, yy', new Date(data.user.membersince)),
                    stats: {
                        views: self.formatStat(data.user.stats.views),
                        subscribers: self.formatStat(data.user.stats.subscribers),
                        followers: self.formatStat(data.user.stats.followers),
                        keeks: self.formatStat(data.user.stats.keeks)
                    }
                });
                
                if (self.localStorageCheck()) {
                    localStorage.setItem('messenger.profile.userId', data.user.user_id);
                }
                
                // Set the title
                self.resetTitle();
                
                // Render the view.
                self.render();
                self.getUserActionButtons();
            } else {
                // Return to the previous screen and display error message                
                self.parent.modal.alert(data.status.message, [{
                    buttonClass: 'ok'
                },
                self.parent.navigateBack()]);
            }
        });
    },

    render: function() {
        var self = this;
        var parent = this.options.parent;
        var _current_conversation_id = localStorage.getItem('messenger.currentConversationId') || null; // Current conversation id
        
        $('#message-user').hide();
        
        if (parent.conversation.get('users').length > 2  && this.model.get('user_id') !== this.parent.currentUserId) {
            $('#message-user').css('display', 'block');
        }
        
        // Get the current conversation by coversation_id, if user refresh the profile page.
        Keek.api('/message/conversation', { conversation_id: _current_conversation_id }, function(data) {
            if (data.status.code === 2000) {                
                if (data.conversation.users.length > 2 && self.model.get('user_id') !== parent.currentUserId) {
                    $('#message-user').css('display', 'block');
                }
            }
        });
        
        this.$el.find('.nano .content').html(this.template(this.model.toJSON()));
        
        $('div.nano', this.$el).nanoScroller({
            preventPageScrolling: true
        });
        
        this.changeTitle(self.getTitle());
        
        this.hideLoadingIndicator();
        
        return this;
    },

    /**
     * Method to return the current view's title
     * 
     * @return string title
     */
    getTitle: function() {
        return this.model.get('username') || '';
    },
    
    /**
     * Method to set the current view's title
     * Called during the fetch
     * 
     * @return void
     */
    resetTitle: function() {
        this.title = this.model.get('username') || '';
    },
    
    handleBlockUser: function(e) {        
        e.preventDefault();
        
        // Init
        var self        = this,
            block_btn   = $(e.target),
            selector    = 'blocked',
            btn_wrapper = block_btn.parent();
        
        // Remove all the buttons
        // Todo: add the animation
        btn_wrapper.empty();
        
        // Make api call
        Keek.api('/block/' + ((block_btn.hasClass(selector)) ? 'destroy' : 'create'), 'post', { user_id: self.model.get('user_id') }, function(data) {
            if (data.status.code === 2000) {
                // Fetch the user information
                self.fetch();
            
                // Display the buttons.
                self.getUserActionButtons();
            } else {
                self.parent.modal.alert(data.status.message, [{
                    buttonClass: 'ok'
                }]);
            }
        });
    },

    getUserActionButtons: function() {
        var self = this,
            _userId = null,
            actions = $('.messenger-profile-actions');
        
        _userId = (self.userId) ? self.userId : localStorage.getItem('messenger.profile.userId');        
        
        $.get('/messenger/get_user_action_buttons?' + randint(1000), {user_id: _userId}, function(data) {
            $.when(actions.empty()).done(function() {
                actions.append(data);
            });
            
            self.delegateEvents();
        });
    },

    formatStat: function(stat) {
        var letter_abbrev, formatted_stat;

        if (stat < 1000) {
            return stat;
        } else {
            if (stat < 1000000) {
                letter_abbrev = 'K';
                formatted_stat = stat / 1000;
            } else {
                letter_abbrev = 'M';
                formatted_stat = stat / 1000000;
            }

            formatted_stat = formatted_stat.toFixed(2);
            //Regex from http://stackoverflow.com/questions/2901102/how-to-print-number-with-commas-as-thousands-separators-in-javascript
            return formatted_stat.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + letter_abbrev;
        }
    },
    
    getBio: function(bio) {
        var _bio = bio.replace(/\s/g, '');
        
        return (_bio != '') ? bio : null;
    },
    
    getGender: function(abbreviated_gender) {
        switch (abbreviated_gender) {
            case 'm':
                return 'Male';
            case 'f':
                return 'Female';
            case 'o':
                return 'Other';
            default:
                return '';
        }
    },

    getAge: function(dateString) {
        //Taken from http://stackoverflow.com/questions/4060004/calculate-age-in-javascript
        if (dateString === '') {
            return '';
        } else {
            var today = new Date();
            var birthDate = new Date(dateString);
            var age = today.getFullYear() - birthDate.getFullYear();
            var m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            return age;
        }
    },

    openConversationWithUser: function(e) {
        e.preventDefault();
        var self = this;
        var profileUserId = this.model.get('user_id');
        var currentUserId = this.parent.currentUserId;
        var foundConvo;

        this.showLoadingIndicator();

        this.parent.views.newMessageView.selectedUserFromExternal = this.model;
        this.parent.navigateForward({
            target: this.parent.views.newMessageView,
            referrer: this,
            navButtonOverride: 'back'
        });
    },

    changeFollowSubscribeCount: function(e) {
        var stats = this.model.get('stats'),
            messengerUsername = this.model.get('username'),
            $followers = $('.followers-count'),
            $subscribers = $('.subscribers-count');
        
        $followers.each(function() {            
            if ($(this).data('username') == messengerUsername) {
                $(this).text(stats.followers);
            }
        });
        
        $subscribers.each(function() {
            if ($(this).data('username') == messengerUsername) {
                $(this).text(stats.subscribers);
            }
        });
    }
});

//*** Add Friend view
//*******************************************
App.Views.AddFriend = App.Views.Messenger.extend({
    el: $('#messenger-add-friend'),
    tagName: "div",
    viewName: 'addFriendView',
    parent: '',
    collection: new Friends(),
    events: {
        'click #add-friend-more-link': 'loadMoreUsers',
        'click #add-friend-submit-search': 'searchUsers'
    },
    defaultTransition: 'left',
    title: 'Add Friend',
    active: false,
    headerNavigationType: 'cancel',
    defaultNavigationTarget: 'conversationView',
    prevFilterTerm: '',
    allowFiltering: true,
    showLoadMoreOnReset: false,
    nextFilterPage: 0,
    statuses: {
        success: 2000,
        senderBlocked: 4305,
        recipientBlocked: 4306,
        requestsDisabled: 4211,
        requestsFollowOnly: 4212,
        requestsSubscribeOnly: 4213
    },
    initialize: function() {
        this.parent = this.options.parent;
    },

    resetUI: function() {
        $('#add-friend-users .content-inside', this.$el).empty();
        $('#messenger-title').show();
    },

    //Override fetch to pull from Api.
    fetch: function(method, model, options) {
        var self = this;
        this.parent.trackView(this.parent.googleAnalyticsEvents.add_friend);
        self.render();
    },

    render: function() {
        var self = this;
        var parent = this.options.parent;
        
        if (localStorage.getItem('messenger.minimized') === 'true') {
            $('#messenger-view-wrapper').hide();
        }
        
        $('#add-friend-search').val('').focus();

        $('#add-friend-users').nanoScroller({
            preventPageScrolling: true
        });

        $('#add-friend-search').off('keyup').keyup(function(e) {
            var enteredText = $(this).val();
            var charCode = e.which || e.keyCode;
            if (charCode === 13) {
                self.searchUsers();
            } else {
                if (enteredText.length === 0) {
                    self.resetFilterState();
                } else {
                    self.filterUsers(enteredText);
                }
            }
        });
        
        this.changeTitle(self.getTitle());
        
        this.hideLoadingIndicator();

        return this;
    },
    
    /**
     * Method to return the current view's title
     * 
     * @return string title
     */
    getTitle: function() {
        return this.title;
    },
    
    appendFriend: function(friend) {
        var friendItemView = new App.Views.AddFriendUserItemView({
            model: friend,
            parent: this
        });
        $('.content-inside', this.el).append(friendItemView.render().el);
    },

    loadMoreUsers: function(e) {
        var self = this;
        var prevFilterTerm = this.prevFilterTerm;
        var requestData = {};
        e.preventDefault();

        requestOpts = {
            term: prevFilterTerm.replace(/(<.*?>)/ig,""), //Parse out HTML tags
            page: self.nextFilterPage,
            include_user_status: 1
        };

        Keek.api('/message/user_search', requestOpts, function(data) {
            if (data.status.code == 2000) {
                if (data.users.length > 0) {
                    var users = [];
                    var currentConversationUsers = self.parent.conversation.get('users');
                    $.each(data.users, function() {
                        var user = new UserModel(this);
                        var isUserInConvo = _.find(currentConversationUsers, function(currentConversationUser) {
                            return user.get('user_id') === currentConversationUser.user_id;
                        });
                        if (user.get('user_id') !== self.parent.currentUserId && !isUserInConvo) {
                            users.push(user);
                        }
                    });

                    _(users).each(function(user){ // in case collection is not empty
                        self.appendFriend(user);
                    }, this);
                } else {
                    self.allowFiltering = false;
                    self.setNoContentState();
                }

                if (data.paging) {
                    if (data.paging.next_page > 0) {
                        //Set the next filter page to be pulled down and show the Load More button
                        self.nextFilterPage = data.paging.next_page;
                        $('#add-friend-load-more').show();
                        $('#add-friend-load-more .loading').fadeOut();
                        $('#add-friend-more-link').fadeIn();
                    } else {
                        //No pages remaining, hide the Load More button and reset the nextFilterPage
                        self.nextFilterPage = 0;
                        $('#add-friend-load-more .loading').hide();
                        $('#add-friend-more-link').show();
                        $('#add-friend-load-more').fadeOut();
                        $('.content-inside .list-user:last-child', self.el).addClass('last');
                    }
                }

                $('#add-friend-users').nanoScroller({
                    preventPageScrolling: true
                });
            }
        });
    },

    filterUsers: function(filterTerm) {
        var self = this;
        var prevFilterTerm = this.prevFilterTerm;
        var requestData = {};

        if (filterTerm.length > 18)
            return false;

        //Reset the allowFiltering flag if the filterTerm is not present in the prevFilterTerm and the filterTerm is shorter than the prevFilterTerm
        if (this.allowFiltering === false && (filterTerm.indexOf(prevFilterTerm) < 0 || filterTerm.length < prevFilterTerm.length || prevFilterTerm.length === 0)) {
            this.allowFiltering = true;
        }

        requestOpts = {
            term: filterTerm.replace(/(<.*?>)/ig,""), //Parse out HTML tags
            include_user_status: 1
        };

        if (this.allowFiltering) {
            Keek.api('/message/contactlist_search', requestOpts, function(data) {
                if (data.status.code == 2000) {
                    if (data.users.length > 0) {
                        var users = [];
                        var currentConversationUsers = self.parent.conversation.get('users');
                        $.each(data.users, function() {
                            var user = new UserModel(this);
                            var isUserInConvo = _.find(currentConversationUsers, function(currentConversationUser) {
                                return user.get('user_id') === currentConversationUser.user_id;
                            });
                            if (user.get('user_id') !== self.parent.currentUserId && !isUserInConvo) {
                                users.push(user);
                            }
                        });

                        $('.new-message-section .content-inside', this.$el).empty();

                        _(users).each(function(user){ // in case collection is not empty
                            self.appendFriend(user);
                        }, this);

                    } else {
                        self.allowFiltering = false;
                        self.setSearchButtonState(filterTerm.replace(/(<.*?>)/ig,""));
                    }
                    self.prevFilterTerm = filterTerm;

                    $('#add-friend-users').nanoScroller({
                        preventPageScrolling: true
                    });
                }
            });
        } else {
            this.setSearchButtonState(filterTerm.replace(/(<.*?>)/ig,""));
        }
    },

    searchUsers: function(e) {
        var self = this;
        var searchTerm = $('#add-friend-search').val();
        var requestData = {};

        requestOpts = {
            term: searchTerm.replace(/(<.*?>)/ig,""), //Parse out HTML tags
            include_user_status: 1
        };

        Keek.api('/message/user_search', requestOpts, function(data) {
            if (data.status.code == 2000) {
                if (data.users.length > 0) {
                    var users = [];
                    var currentConversationUsers = self.parent.conversation.get('users');
                    $.each(data.users, function() {
                        var user = new UserModel(this);
                        var isUserInConvo = _.find(currentConversationUsers, function(currentConversationUser) {
                            return user.get('user_id') === currentConversationUser.user_id;
                        });
                        if (user.get('user_id') !== self.parent.currentUserId && !isUserInConvo) {
                            users.push(user);
                        }
                    });

                    $('.new-message-section .content-inside', this.$el).empty();

                    _(users).each(function(user){ // in case collection is not empty
                        self.appendFriend(user);
                    }, this);
                } else {
                    self.setNoContentState();
                }

                if (data.paging) {
                    if (data.paging.next_page > 0) {
                        //Set the next filter page to be pulled down and show the Load More button
                        self.nextFilterPage = data.paging.next_page;
                        $('#add-friend-load-more').show();
                        $('#add-friend-load-more .loading').fadeOut();
                        $('#add-friend-more-link').fadeIn();
                    } else {
                        //No pages remaining, hide the Load More button and reset the nextFilterPage
                        self.nextFilterPage = 0;
                        $('#add-friend-load-more .loading').hide();
                        $('#add-friend-more-link').show();
                        $('#add-friend-load-more').fadeOut();
                        $('.content-inside .list-user:last-child', self.el).addClass('last');
                    }
                }

                $('#add-friend-users').nanoScroller({
                    preventPageScrolling: true
                });
            }
        });
    },

    resetFilterState: function() {
        var self = this;
        if (this.showLoadMoreOnReset) {
            $('#add-friend-load-more').show();
        }

        this.prevFilterTerm = '';

        $('#add-friend-users .content-inside', this.$el).empty();
        _(this.collection.models).each(function(friend){ // in case collection is not empty
            self.appendFriend(friend);
        }, this);

        $('#add-friend-users').nanoScroller({
            preventPageScrolling: true
        });
    },

    setNoContentState: function(hideMsg) {
        var noUserMsg = $('.filter-no-content', this.el).first().clone();
        $('#add-friend-load-more').hide();
        $('#add-friend-users .content-inside', this.$el).empty();
        if (!hideMsg) {
            noUserMsg.appendTo($('#add-friend-users .content-inside', this.$el)).show();
        }
        $('#add-friend-users').nanoScroller({
            preventPageScrolling: true
        });
    },

    setSearchButtonState: function(searchTerm) {
        var stubUser = new UserModel({
            username: searchTerm,
            type: 'searchButton'
        });

        var searchButtonItem = new App.Views.AddFriendUserItemView({
            template: _.template($('#tmpl-search-button').html()),
            parent: this,
            model: stubUser
        });

        searchButtonItem.template = _.template($('#tmpl-search-button').html());
        $('#add-friend-users .content-inside', this.$el).empty().append(searchButtonItem.render().el);
    }
});

App.Views.AddFriendUserItemView = Backbone.View.extend({
    tagName: 'div',
    parent: '',
    attributes: {
        'class': 'list-user right-content-user new-message-user'
    },
    template: _.template($('#tmpl-new-message-user-item').html()),
    initialize: function() {
        this.parent = this.options.parent;
    },
    render: function() {
        this.$el.html(this.template(this.model.toJSON()));
        this.$el.prop('id', 'add-user-' + this.model.get('user_id'));
        return this;
    },
    events: {
        'click': 'selectUser'
    },
    selectUser: function(e) {
        var conversationView = this.parent.parent.views.conversationView;
        var conversation_id = this.parent.parent.conversation.get('conversation_id');
        var self = this;

        if (this.model.get('type') && this.model.get('type') === 'searchButton') {
            this.parent.searchUsers();
        } else {
            var requestOpts = {
                user_id: this.model.get('user_id'),
                conversation_id: conversation_id,
                tracking_id: Date.now()
            };
            
            // Check if current user is able to send the message
            Keek.api('/message/can_send_message_to', { user_id: this.model.get('user_id') }, function(data) {
                if (data.status.code !== 2000) {
                    self.parent.parent.modal.alert(data.status.message, [{
                        buttonClass: 'ok'
                    }]);
                } else {
                    Keek.api('/message/invite_user', 'post', requestOpts, function(data) {
                        if (data.status.code === 2000 || data.status.code === 4043) {
                            //Add +1 to the user count of the conversation view's conversation
                            Keek.api('/message/conversation', { conversation_id: conversation_id }, function(data) {
                                self.parent.parent.conversation.set(data.conversation);
                                //Load conversation view
                                self.parent.parent.navigateBack();
                            });
                        } else {
                            self.parent.parent.modal.alert(data.status.message, [{
                                buttonClass: 'ok'
                            }]);
                        }
                    });
                }
            });
        }
    }
});

//Instead of using the Friends collection, we're creating a new collection.
//The current user needs to be at the top of the list and the Friends collection was using
//a comparator which was screwing that up and we're being lazy and not finding a proper workaround.
var Participants = Backbone.Collection.extend({
    model: UserModel
});

//*** Conversation participants list view
//*******************************************
App.Views.ConversationParticipants = App.Views.Messenger.extend({
    el: $('#messenger-conversation-users-list'),
    tagName: "div",
    viewName: 'conversationParticipantsView',
    parent: '',
    collection: new Participants(),
    defaultTransition: 'left',
    title: '',
    active: false,
    headerNavigationType: 'back',
    defaultNavigationTarget: 'conversationView',

    initialize: function() {
        this.parent = this.options.parent;
    },

    resetUI: function() {
        $('div.new-message-section', this.el).empty();
        $('#users-in-convo').text();
        $('#messenger-title').show();
    },

    fetch: function() {
        var self = this,
            conversation_id = localStorage.getItem('messenger.currentConversationId') || null;
        
        if (conversation_id === null) {
            this.parent.navigateBack();
        } else {
            Keek.api('/message/conversation', { conversation_id: conversation_id }, function(data) {
                if (data.status.code == 2000) {
                    self.collection.reset();
                    var currentUserObject;
                    $.each(data.conversation.users, function() {
                        var participant = new UserModel(this);
                        if (self.parent.currentUserId == this.user_id) {
                            //In order to get the current user as the last user in the list, we'll cache their object for now
                            //then push it once the each loop has finished processing.
                            currentUserObject = participant;
                        } else {
                            self.collection.add(participant);
                        }
                    });
                    if (currentUserObject) {
                        self.collection.add(currentUserObject);
                    }
                    
                    // Reset the current view's title
                    self.resetTitle();
                    // Render
                    self.render();
                }
            });
        }
    },

    render: function() {
        var self = this;
        var parent = this.options.parent;
        var participantCount = this.collection.length;

        $('div.new-message-section', this.el).empty();

        _(this.collection.models).each(function(item, index){ // in case collection is not empty
            this.appendParticipant(item);
        }, this);
        
        $('.new-message-recent .list-user:last-child', self.el).addClass('last');

        // Hide the current users online status
        $('.new-message-recent .list-user:last-child .online-status-wrap', self.el).hide();
        
        $('#users-in-convo').text(participantCount);
        
        if (participantCount > 1) {
            $('.count-plural-v').text('are');
            $('.count-plural-p').text('people');
        } else {
            $('.count-plural-v').text('is');
            $('.count-plural-p').text('person');
        }
        
        $('.new-message-users.nano', this.el).nanoScroller({
            preventPageScrolling: true
        });
        
        // Change the title
        this.changeTitle(self.getTitle());
        
        // Hide the loading indicator
        this.hideLoadingIndicator();
        
        return this;
    },
    
    /**
     * Method to return the current view's title
     * 
     * @return string title
     */
    getTitle: function() {
        return (this.collection.models.length > 0) ? this.title : '';
    },
    
    /**
     * Method to set the current view's title
     * Called during the fetch
     * 
     * @return void
     */
    resetTitle: function() {
        var self = this,
            title = '',
            separator = ', ';
        
        if (self.collection.models.length > 0) {
            $.each(self.collection.models, function(idx, user) {
                // Set the username
                if (user.get('user_id') !== self.parent.currentUserId) {
                    title += user.get('username');
                    title += separator;
                }
            });
            
            if (title.length > 0) {
                title = title.slice(0, -2);
            }
            
            this.title = title;
        }
    },
    
    appendParticipant: function(participant) {
        var participantItemView = new App.Views.ConversationParticipantsUserItemView({
            model: participant,
            parent: this
        });
        $('div.new-message-section', this.el).append(participantItemView.render().el);
    }
});

App.Views.ConversationParticipantsUserItemView = Backbone.View.extend({
    tagName: 'div',
    parent: '',
    attributes: {
        'class': 'list-user right-content-user new-message-user'
    },
    template: _.template($('#tmpl-new-message-user-item').html()),
    events: {
        'click': 'loadUserProfile'
    },
    initialize: function() {
        this.parent = this.options.parent;
    },
    render: function() {
        this.$el.html(this.template(this.model.toJSON()));
        this.$el.prop('id', 'nm-user-' + this.model.get('user_id'));
        return this;
    },
    loadUserProfile: function(e) {
        e.preventDefault();
        var messenger_main = this.options.parent.options.parent;
        //Set user id in view object
        messenger_main.views.profileView.userId = this.model.get('user_id');
        messenger_main.navigateForward({
            target: messenger_main.views.profileView,
            referrer: this.options.parent
        });
    }
});

App.Views.MessengerLanding = App.Views.Messenger.extend({
    el: $('#messenger-landing'),
    tagName: "div",
    viewName: 'messengerLandingView',
    parent: '',
    collection: new ActiveConversations(),
    defaultTransition: '',
    title: '',
    active: false,
    headerNavigationType: '',
    defaultNavigationTarget: '',
    amountConversationsToPull: 50,
    events: {
        'click a#new-message-landing': 'openNewMessage',
        'click a#landing-load-more-link': 'loadMoreConversations'
    },

    initialize: function() {
        var self = this;
        
        this.parent = this.options.parent;
        this._ConversationViews = {}; // view cache for further reuse
        _.bindAll(this, 'add', 'remove', 'sortConversationItemViews');
        this.collection.bind('add', this.add);
        this.collection.bind('remove', this.remove);
        this.collection.bind('change', this.sortConversationItemViews);
        this.loadMoreEl = $('#landing-load-more');
        this.fetch();
    },
    
    resetUI: function() {        
        $('div#messenger-landing-items', this.el).empty();
        $('#keekmail-list .right').empty();
    },

    fetch: function() {
        var self = this,
            fetched;
        
        if (this.collection.length === 0) {
            fetched = Keek.api('/message/conversations', { number: this.amountConversationsToPull }, function(data) {
                var conversations = [];

                self.resetUI();

                $.each(data.conversations, function() {
                    var conversation = new ConversationModel(this);
                    conversations.push(conversation);
                });
                self.collection.reset();
                self.collection.add(conversations);

                if (data.more_older_conversations > 0) {
                    self.loadMoreEl.show();
                }

                self.render(true);
            });
        } else {
            if ($('.list-user').length > 0){
                this.render();
            }else{
                this.render(true);
            }
        }
        
        // Quick fix for WEB-3697
        // Handle the conversations landing page
        fetched.done(function() {
            (function updateMsgLanding() {
                Keek.api('/message/conversations', function(data) {
                    // Check api return status code
                    if(data.status.code === 2000) {
                        // Empty
                        if(!data.conversations.length) {
                            // TODO
                        }
                        
                        $.each(data.conversations, function() {
                            if ($.inArray(this.conversation_id, self.collection.pluck('conversation_id')) >= 0) {
                                var conv_id = this.conversation_id;
                                var found = self.collection.find(function(item) {
                                    return item.get('conversation_id') === conv_id;
                                });
                                
                                // Update the conversation
                                found.set(this);
                            } else {
                                // Add the new conversation to current collection
                                self.collection.add(new ConversationModel(this));
                            }
                        });
                    } else {
                        throw data.status.message;
                    }
                });
                
                setTimeout(updateMsgLanding, 5000);
            })();
        });
    },

    render: function() {
        var self = this, pending = false;

        if (this.collection.models.length === 0) {
            this.setNoContentState();
        }

        var currentMessengerView = localStorage.getItem('messenger.current_view');
        if (currentMessengerView === 'messenger-conversation'){
            var currentConversationId = '#' + localStorage.getItem('messenger.currentConversationId');
            $(currentConversationId).removeClass('message-pending');
        }

        this.hideLoadingIndicator();
        
        return this;
    },

    //Handles the creation of a messenger landing list item  view when a conversation model is added to the collection
    add: function(convo, collection) {
        var messengerLandingItemView = new App.Views.MessengerLandingItemView({
            model: convo,
            parent: this
        });

        this._ConversationViews[convo.get('conversation_id')] = messengerLandingItemView;
        this.collection.sort();

        $('#messenger-landing-items', this.el).append(messengerLandingItemView.render().el);

        if (collection.length === _.size(this._ConversationViews)) {
            this.sortConversationItemViews();
        }
    },
    
    remove: function(convo) {
        var conversation_id = convo.get('conversation_id');
        var listViewItem = this._ConversationViews[conversation_id];

        listViewItem.remove();
    },

    setNoContentState: function() {
        $('div.content-inside', this.el).html("<div id='no-conversation'><p>You have no messages</p></div>");
    },

    sortConversationItemViews: function() {
        var messageArea = $('#messenger-landing-items');
        var copiedCollection = $.extend(true, [], this.collection.models);

        this.collection.sort();

        for(var i=0; i < this.collection.length; i++)
            copiedCollection[i] = this._ConversationViews[this.collection.models[i].get('conversation_id')].$el;

        for(var i=0; i < copiedCollection.length; i++) {
            messageArea.append(copiedCollection[i]);
            delete copiedCollection[i];
        }
    },

    openNewMessage: function(e) {
        e.preventDefault();
        var parent = this.options.parent;
        var currentMessengerView = localStorage.getItem('messenger.current_view');
        if (localStorage.getItem('messenger.minimized') === 'true'){
            parent.toggleMessenger();   
        }
        if(localStorage.getItem('messenger.closed') === 'true'){
            parent.openMessenger();
        }
        //Force a show as this action can occur when messenger has been closed by another window
        $('#keek-messenger-window').show(); //TODO: This should be an object reference, not a selector
        parent.protectFromClose = true;
        localStorage.setItem('messenger.close_messenger', '1');
        localStorage.removeItem('messenger.close_messenger');
        if (currentMessengerView !== 'messenger-new-message'){
            clearInterval(this.polling);

            var currentView = $('#messenger-view-wrapper-inside .messenger-view').prop('id');
            var currentViewObj = _.find(this.views, function(view) {
                return view.$el.prop('id') === currentView;
            });

            this.parent.views.conversationView.scrollTop = null;
            parent.landingPageNavigateForward({
                target: this.views.newMessageView,
                referrer: currentViewObj
            });
        }
    },

    loadMoreConversations: function(e) {
        e.preventDefault();

        //Get oldest conversation object
        var self = this;
        var oldestConversation = this.collection.last();
        var oldestConvoMessage = oldestConversation.get('message');
        var maxDate;

        self.loadMoreEl.find('.load-more-link').hide();
        self.loadMoreEl.find('.loading').fadeIn(200);

        if (oldestConvoMessage.details.caption || oldestConvoMessage.details.video) {
            maxDate = oldestConvoMessage.created;
        } else {
            maxDate = oldestConversation.get('last_updated');
        }

        Keek.api('/message/conversations', { number: this.amountConversationsToPull, max_date: maxDate }, function(data) {
            if (data.status.code !== 2000) {
                console.error("Conversation List View Error: %s (%i)", data.status.message, data.status.code);
            } else {
                var conversations = [];

                if (data.conversations.length > 0) {
                    _.each(data.conversations, function(conversation) {
                        var alreadyInCollection = self.collection.find(function(existingConversation) {
                            return existingConversation.get('conversation_id') === conversation.conversation_id;
                        });

                        if (!alreadyInCollection) {
                            var conversationObj = new ConversationModel(conversation);
                            conversations.push(conversationObj);
                        }
                    });

                    self.collection.add(conversations);

                    if (data.more_older_conversations > 0) {
                        self.loadMoreEl.show();
                        self.loadMoreEl.find('.loading').stop().hide();
                        self.loadMoreEl.find('.load-more-link').fadeIn();
                    } else {
                        self.loadMoreEl.find('.loading').stop().hide();
                        self.loadMoreEl.hide();
                    }

                    self.render(true);
                } else {
                    self.loadMoreEl.find('.loading').stop().hide();
                    self.loadMoreEl.hide();
                }
            }
        });
    }
});

App.Views.MessengerLandingItemView = Backbone.View.extend({
    tagName: 'div',
    template: _.template($('#tmpl-messenger-landing-item').html()),
    events: {
        "click .info": "openConversation",
        "click .message-action-button.leave": "leaveMessageOverlay",
        "click .message-action-button.delete": "deleteMessageOverlay"
    },
    attributes : function () {
        return {
            'class': 'messenger-landing-item',
            id: this.model.get('conversation_id')
        };
    },
    initialize: function() {
        this.model.bind('change', this.render, this);
        this.parent = this.options.parent;
    },
    render: function() {
        var self = this;
        //Clone current convo model
        var clonedConversation = this.model.clone();

        this.determineCaption(clonedConversation);

        var usersWithoutCurrentUser = _.reject(this.model.get('users'), function(user) {
            return user.user_id === self.options.parent.options.parent.currentUserId;
        });

        clonedConversation.set({
            users: usersWithoutCurrentUser
        });

        this.$el.html(this.template(clonedConversation.toJSON()));
        if (this.model.get('messages_pending') > 0) {
            this.$el.addClass('message-pending');
        } else {
            this.$el.removeClass('message-pending');
        }

        $('.action-button .message-action-button').live('click', function(){
            $(this).addClass('selected');
        });

        return this;
    },
    determineCaption: function(model){
        if (model.attributes.message.details.state === 'join'){
            var joinCaption = model.attributes.message.details.user.username + ' was added';
            model.set({message: { details: { caption: joinCaption }}});
        } else if (this.model.attributes.message.details.state === 'exit'){
            var exitCaption = model.attributes.message.details.user.username + ' has left';
            model.set({message:{ details: { caption: exitCaption }}});
        }
    },
    leaveMessageOverlay: function(e) {
        e.preventDefault();
        var self = this;
        var parent = this.options['parent'];
        var opts = {
            title: 'Leave Conversation',
            text: (this.model.get('users').length > 2) ? 'Message history will be deleted and you will no longer receive updates' : 'Are you sure you want to leave this conversation?',
            buttons: [
                {
                    text: 'Leave Conversation',
                    callback: function(){
                        self.leaveConversation();
                    },
                    classes: ['delete-alert-ok leave-conversation'],
                    closeDialog: true
                },
                {
                    text: 'Cancel',
                    callback: function(){
                        $('.action-button .message-action-button').removeClass('selected');
                    },
                    closeDialog: true
                }
            ]
        };
        alertDialog(opts);
    },
    deleteMessageOverlay: function(e) {
        e.preventDefault();
        var self = this;
        var parent = this.options['parent'];
        var opts = {
            title: 'Delete Conversation',
            text: 'Are you sure you want to delete this message request?',
            buttons: [
                {
                    text: 'Delete Conversation',
                    callback: function(){
                        self.leaveConversation();
                    },
                    classes: ['delete-alert-ok delete-conversation'],
                    closeDialog: true
                },
                {
                    text: 'Cancel',
                    callback: function(){
                        $('.action-button .message-action-button').removeClass('selected');
                    },
                    closeDialog: true
                }
            ]
        };
        alertDialog(opts);
    },
    leaveConversation: function(e) {
        var self = this;
        var conversation_id = $('.message-action-button.selected').parent().parent().closest('div').attr('id');
        var currentPendingMsgs = self.parent.parent.model.get('priv');
        var remainingPendingMsgs;

        var conversationListView = this.parent.views.conversationListView;
        var conversationModel = conversationListView.collection.models.length === 0 ? null : _.find(conversationListView.collection.models, function(convo) {
            return convo.get('conversation_id') === conversation_id;
        });

        var messengerLandingView = this.parent.views.messengerLandingView;
        var messengerConversationModel = messengerLandingView ? messengerLandingView.collection.models.length === 0 ? null : _.find(messengerLandingView.collection.models, function(convo) {
            return convo.get('conversation_id') === conversation_id;
        }) : null;

        Keek.api('/message/leave_conversation', 'post', { conversation_id: conversation_id }, function(data) {
            var currentHistoryIndex = localStorage.getItem('messenger.history.index');
            var currentConversationId = localStorage.getItem('messenger.currentConversationId');
            var currentPendingMsgs

            if (conversationModel !== null) {
                conversationListView.collection.remove(conversationModel);
                conversationListView.render();
            }

            if (messengerConversationModel !== null) {
                messengerLandingView.collection.remove(messengerConversationModel);
                messengerLandingView.render(true);
            }

            if (conversationModel) {
                remainingPendingMsgs = currentPendingMsgs - conversationModel.get('messages_pending');
            } else if (messengerConversationModel) {
                remainingPendingMsgs = currentPendingMsgs - messengerConversationModel.get('messages_pending');
            }

            self.parent.parent.model.set('priv', remainingPendingMsgs);

            if(currentHistoryIndex > 0 && (currentConversationId === conversation_id)){
                self.parent.parent.navigateToOrigin();
            }
        });
    },
    openConversation: function(e) {
        if (!$(e.target).is('.recent-msg a')) {
            var parent = this.options['parent'];
            var selected_convo_id = this.model.get('conversation_id');
            var currentConversationId = localStorage.getItem('messenger.currentConversationId');
            var currentMessengerView = localStorage.getItem('messenger.current_view');
            var conversationListView = this.parent.parent.views.conversationListView;
            var uninitializedVal = localStorage.getItem('messenger.uninitialized');

            $('#messenger-modal').hide();

            clearInterval(this.parent.polling);

            //Force a show as this action can occur when messenger has been closed by another window
            $('#keek-messenger-window').show(); //TODO: This should be an object reference, not a selector
            parent.parent.protectFromClose = true;
            localStorage.setItem('messenger.close_messenger', '1');
            localStorage.removeItem('messenger.close_messenger');
            
            if(selected_convo_id !== currentConversationId ||
               (selected_convo_id === currentConversationId && (currentMessengerView !== 'messenger-conversation' || uninitializedVal === '1'))) {
                clearInterval(this.parent.polling);

                parent.parent.conversation = this.model.clone();
                parent.parent.views.conversationView.conversation = this.model.clone();

                if (this.parent.localStorageCheck()) {
                    localStorage.setItem('messenger.currentConversationId', selected_convo_id);
                }

                if (this.model.get('messages_pending') > 0) {
                    var prevNumPending = parent.parent.model.get('priv');
                    var messagesPendingInConv = this.model.get('messages_pending');

                    parent.parent.model.set({ priv: prevNumPending - messagesPendingInConv });

                    this.model.set('messages_pending', 0);

                    var conversationListItem = _.find(conversationListView.collection.models, function(conversation) {
                        return conversation.get('conversation_id') === currentConversationId;
                    });

                    if (conversationListItem) {
                        conversationListItem.set('messages_pending', 0);
                    }
                }

                if (localStorage.getItem('messenger.minimized') === 'true'){
                    parent.parent.toggleMessenger();
                }

                if(localStorage.getItem('messenger.closed') === 'true'){
                    parent.preventInitialFetch = false;
                    parent.parent.openMessenger();
                }

                var currentView = $('#messenger-view-wrapper-inside .messenger-view').prop('id');
                var currentViewObj = _.find(parent.parent.views, function(view) {
                    return view.$el.prop('id') === currentView;
                });

                parent.parent.views.conversationView.scrollTop = null;

                if (currentView === 'messenger-conversation'){
                    parent.parent.views.conversationView.showLoadingIndicator();
                    // WEB-3728 Message request goes into a different conversation
                    if(uninitializedVal === null) {
                        parent.parent.views.conversationView.fetch();
                    }
                    
                }else{
                    parent.parent.landingPageNavigateForward({
                        target: parent.parent.views.conversationView,
                        referrer: currentViewObj
                    });
                }
            } 
        }
    }
});

//******END App.Messenger*************************************************************************

//Performing this action triggers a storage event in all inactive tabs/windows on the current. Setting the close_messenger
//flag will trigger the closing of the messenger in these inactive windows. The flag is cleared in the messenger's
//initialize function.
localStorage.setItem('messenger.close_messenger', '1');
localStorage.removeItem('messenger.close_messenger');


$(window).load(function() {
    var isMainWindow, messengerSessionExists;
    var localStorageCheck = function() {
        return typeof window.localStorage != 'undefined';
    };

    //If the browser does not support input/textarea placeholders, implement a workaround.
    var placeholderSupported = !!( 'placeholder' in document.createElement('input') );
    if (!placeholderSupported) {
        $('[placeholder]').live('focus', function() {
            var input = $(this);
            if (input.val() == input.attr('placeholder')) {
                input.val('');
                input.removeClass('placeholder');
            }
        });

        $('[placeholder]').live('blur', function() {
            var input = $(this);
            if (input.val() === '' || input.val() === input.attr('placeholder')) {
                input.addClass('placeholder');
                input.val(input.attr('placeholder'));
            }
        }).blur();
    }

    $.get('/messenger?_='+randint(1000), function(data) {
        $('body').append(data);

        //Create the Messenger view in App.Messnger and fires its initialize() function
        App.Messenger = new App.Views.Messenger({ currentUserId: $('#keek-messenger-wrap').data('currentuser') });
    });

    this.hidePlayerOverlay = function() {
        $('#messenger-keek-overlay').fadeOut(250, function(){
            $('#main-messenger').remove();
        });
    }
});

//From https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Object/keys
//Allows you to get the keys off of an object. More importantly, allows for countjng the keys in an object with Object.keys(obj).length
if (!Object.keys) {
  Object.keys = (function () {
    var hasOwnProperty = Object.prototype.hasOwnProperty,
        hasDontEnumBug = !({toString: null}).propertyIsEnumerable('toString'),
        dontEnums = [
          'toString',
          'toLocaleString',
          'valueOf',
          'hasOwnProperty',
          'isPrototypeOf',
          'propertyIsEnumerable',
          'constructor'
        ],
        dontEnumsLength = dontEnums.length

    return function (obj) {
      if (typeof obj !== 'object' && typeof obj !== 'function' || obj === null) throw new TypeError('Object.keys called on non-object');

      var result = [];

      for (var prop in obj) {
        if (hasOwnProperty.call(obj, prop)) result.push(prop);
      }

      if (hasDontEnumBug) {
        for (var i=0; i < dontEnumsLength; i++) {
          if (hasOwnProperty.call(obj, dontEnums[i])) result.push(dontEnums[i]);
        }
      }
      return result;
    }
  })()
};

//http://docs.tinyfactory.co/jquery/2012/08/11/text-overflow-ellipsis-using-jquery.html
$.fn.ellipsis=function(){return this.each(function(){var a=$(this);if("hidden"==a.css("overflow")){var c=a.html(),d=a.hasClass("multiline"),b=$(this.cloneNode(!0)).hide().css("position","absolute").css("overflow","visible").width(d?a.width():"auto").height(d?"auto":a.height());a.after(b);for(d=d?function(){return b.height()>a.height()}:function(){return b.width()>a.width()};0<c.length&&d();)c=c.substr(0,c.length-1),b.html(c+"...");a.html(b.html());b.remove()}})};

})(jQuery, Backbone, Keek);

